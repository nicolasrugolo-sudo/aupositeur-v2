import {defineField, defineType} from 'sanity'

export const musicTrack = defineType({
  name: 'musicTrack',
  title: 'Musique',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Titre', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'description', title: 'Description', type: 'text', rows: 4}),
    defineField({name: 'lyrics', title: 'Paroles / texte', type: 'portableText'}),
    defineField({name: 'cover', title: 'Visuel', type: 'imageWithAlt'}),
    defineField({name: 'audio', title: 'Fichier audio', type: 'file'}),
    defineField({name: 'featured', title: 'Mise en avant', type: 'boolean', initialValue: false}),
    defineField({name: 'publishedAt', title: 'Date de publication', type: 'datetime'}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
})