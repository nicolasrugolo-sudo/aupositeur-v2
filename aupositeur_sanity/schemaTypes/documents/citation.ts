import {defineField, defineType} from 'sanity'

export const citation = defineType({
  name: 'citation',
  title: 'Citation',
  type: 'document',

  fields: [
    defineField({
      name: 'text',
      title: 'Citation',
      type: 'text',
      rows: 6,
      validation: (rule) => rule.required(),
    }),

    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'text', maxLength: 96},
      validation: (rule) => rule.required(),
    }),

    defineField({
      name: 'author',
      title: 'Auteur',
      type: 'string',
      initialValue: 'Aupositeur',
      validation: (rule) => rule.required(),
    }),

    defineField({
      name: 'source',
      title: 'Source originale',
      type: 'string',
    }),

    defineField({
      name: 'context',
      title: 'Contexte',
      type: 'text',
      rows: 4,
    }),

    defineField({
      name: 'video',
      title: 'Vidéo',
      type: 'string',
      description: 'Chemin ou URL de la vidéo associée.',
    }),

    defineField({
      name: 'featured',
      title: 'Mise en avant',
      type: 'boolean',
      initialValue: false,
    }),

    defineField({
      name: 'order',
      title: 'Ordre',
      type: 'number',
      initialValue: 0,
    }),

    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),
  ],

  preview: {
    select: {
      title: 'text',
      subtitle: 'author',
    },
  },
})