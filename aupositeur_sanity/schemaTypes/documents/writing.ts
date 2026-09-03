import {defineField, defineType} from 'sanity'

export const writing = defineType({
  name: 'writing',
  title: 'Écrit',
  type: 'document',

  fields: [
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      validation: (rule) => rule.required(),
    }),

    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (rule) => rule.required(),
    }),

    defineField({
      name: 'kind',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          {title: 'Poème', value: 'poem'},
          {title: 'Texte', value: 'text'},
          {title: 'Article', value: 'article'},
          {title: 'Fragment', value: 'fragment'},
        ],
      },
      initialValue: 'poem',
    }),

    defineField({
      name: 'year',
      title: 'Année',
      type: 'number',
    }),

    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),

    defineField({
      name: 'themes',
      title: 'Thèmes',
      type: 'array',
      of: [{type: 'string'}],
    }),

    defineField({
      name: 'body',
      title: 'Texte',
      type: 'portableText',
    }),

    defineField({
      name: 'featured',
      title: 'Mise en avant',
      type: 'boolean',
      initialValue: false,
    }),

    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),
  ],
})