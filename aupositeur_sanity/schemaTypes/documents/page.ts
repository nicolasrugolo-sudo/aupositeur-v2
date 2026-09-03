import {defineField, defineType} from 'sanity'

export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Titre', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'pageKey',
      title: 'Clé de page',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'intro', title: 'Introduction', type: 'text', rows: 5}),
    defineField({name: 'body', title: 'Contenu', type: 'portableText'}),
    defineField({name: 'heroImage', title: 'Image principale', type: 'imageWithAlt'}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
})