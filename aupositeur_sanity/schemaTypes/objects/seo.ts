import {defineField, defineType} from 'sanity'

export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titre SEO', type: 'string'}),
    defineField({name: 'description', title: 'Meta description', type: 'text', rows: 3}),
    defineField({name: 'noIndex', title: 'Ne pas indexer', type: 'boolean', initialValue: false}),
  ],
})