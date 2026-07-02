import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const idParamSchema = z.object({ id: z.string().uuid() });

const versionIdParamSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
});

const formFieldSchema = z.object({
  fieldCode: z.string().min(1).max(50),
  label: z.string().min(1).max(255),
  inputType: z.string().min(1).max(20),
  isRequired: z.boolean().optional(),
  validationRules: z.string().nullable().optional(),
  calculationFormula: z.string().nullable().optional(),
  displayOrder: z.number().int(),
  isCommentable: z.boolean().optional(),
});

const formSectionSchema = z.object({
  sectionCode: z.string().min(1).max(50),
  title: z.string().min(1).max(255),
  displayOrder: z.number().int(),
  isRepeating: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  fields: z.array(formFieldSchema),
});

const createVersionSchema = z.object({
  schemaVersion: z.string().min(1).max(20),
  sections: z.array(formSectionSchema),
});

function serializeVersion(version: {
  id: string;
  formTemplateId: string;
  versionNumber: number;
  schemaVersion: string;
  isCurrent: boolean;
  publishedAt: Date | null;
  sections: Array<{
    id: string;
    sectionCode: string;
    title: string;
    displayOrder: number;
    isRepeating: boolean;
    isRequired: boolean;
    fields: Array<{
      id: string;
      fieldCode: string;
      label: string;
      inputType: string;
      isRequired: boolean;
      validationRules: string | null;
      displayOrder: number;
    }>;
  }>;
}) {
  return {
    id: version.id,
    formTemplateId: version.formTemplateId,
    versionNumber: version.versionNumber,
    schemaVersion: version.schemaVersion,
    isCurrent: version.isCurrent,
    publishedAt: version.publishedAt,
    sections: version.sections.map((s) => ({
      id: s.id,
      sectionCode: s.sectionCode,
      title: s.title,
      displayOrder: s.displayOrder,
      isRepeating: s.isRepeating,
      isRequired: s.isRequired,
      fields: s.fields.map((f) => ({
        id: f.id,
        fieldCode: f.fieldCode,
        label: f.label,
        inputType: f.inputType,
        isRequired: f.isRequired,
        validationRules: f.validationRules,
        displayOrder: f.displayOrder,
      })),
    })),
  };
}

export default async function formTemplatesRoutes(fastify: FastifyInstance) {
  // GET /api/form-templates/:id/versions/current — get current version with sections and fields
  fastify.get(
    "/api/form-templates/:id/versions/current",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const params = idParamSchema.parse(request.params);

      const template = await prisma.formTemplate.findUnique({
        where: { id: params.id },
      });
      if (!template) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const version = await prisma.formTemplateVersion.findFirst({
        where: { formTemplateId: params.id, isCurrent: true },
        include: {
          sections: {
            orderBy: { displayOrder: "asc" },
            include: {
              fields: {
                orderBy: { displayOrder: "asc" },
              },
            },
          },
        },
      });

      if (!version) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      return reply.status(200).send(serializeVersion(version));
    },
  );

  // GET /api/form-templates/:id/versions/:versionId — get specific version with sections and fields
  fastify.get(
    "/api/form-templates/:id/versions/:versionId",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const params = versionIdParamSchema.parse(request.params);

      const template = await prisma.formTemplate.findUnique({
        where: { id: params.id },
      });
      if (!template) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const version = await prisma.formTemplateVersion.findFirst({
        where: { id: params.versionId, formTemplateId: params.id },
        include: {
          sections: {
            orderBy: { displayOrder: "asc" },
            include: {
              fields: {
                orderBy: { displayOrder: "asc" },
              },
            },
          },
        },
      });

      if (!version) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      return reply.status(200).send(serializeVersion(version));
    },
  );

  // POST /api/form-templates/:id/versions — [ADMIN] publish new version
  fastify.post(
    "/api/form-templates/:id/versions",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = idParamSchema.parse(request.params);
      const body = createVersionSchema.parse(request.body);
      const currentUser = request.currentUser!;

      const template = await prisma.formTemplate.findUnique({
        where: { id: params.id },
      });
      if (!template) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const result = await prisma.$transaction(async (tx) => {
        // a. Mark existing isCurrent=true versions as isCurrent=false
        await tx.formTemplateVersion.updateMany({
          where: { formTemplateId: params.id, isCurrent: true },
          data: { isCurrent: false },
        });

        // Determine the next version number
        const aggregate = await tx.formTemplateVersion.aggregate({
          where: { formTemplateId: params.id },
          _max: { versionNumber: true },
        });
        const nextVersionNumber = (aggregate._max.versionNumber ?? 0) + 1;

        // b. Create new FormTemplateVersion
        const newVersion = await tx.formTemplateVersion.create({
          data: {
            formTemplateId: params.id,
            schemaVersion: body.schemaVersion,
            versionNumber: nextVersionNumber,
            isCurrent: true,
            publishedAt: new Date(),
            publishedBy: currentUser.id,
          },
        });

        // c. Create FormSections and FormFields
        for (const section of body.sections) {
          const newSection = await tx.formSection.create({
            data: {
              formTemplateVersionId: newVersion.id,
              sectionCode: section.sectionCode,
              title: section.title,
              displayOrder: section.displayOrder,
              isRepeating: section.isRepeating ?? false,
              isRequired: section.isRequired ?? true,
            },
          });

          for (const field of section.fields) {
            await tx.formField.create({
              data: {
                formSectionId: newSection.id,
                fieldCode: field.fieldCode,
                label: field.label,
                inputType: field.inputType,
                isRequired: field.isRequired ?? false,
                validationRules: field.validationRules ?? null,
                calculationFormula: field.calculationFormula ?? null,
                displayOrder: field.displayOrder,
                isCommentable: field.isCommentable ?? false,
              },
            });
          }
        }

        return newVersion;
      });

      return reply.status(201).send({
        id: result.id,
        versionNumber: result.versionNumber,
      });
    },
  );
}
