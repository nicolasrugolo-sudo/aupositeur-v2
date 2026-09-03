import {defineField, defineType} from 'sanity'

export const book = defineType({
  name: 'book',
  title: 'Livre',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Titre', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'subtitle', title: 'Sous-titre', type: 'string'}),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'cover', title: 'Couverture', type: 'imageWithAlt'}),
    defineField({name: 'description', title: 'Description', type: 'portableText'}),
    defineField({name: 'isbn', title: 'ISBN', type: 'string'}),
    defineField({name: 'publisher', title: 'Éditeur', type: 'string'}),
    defineField({name: 'publicationDate', title: 'Date de publication', type: 'date'}),
    defineField({name: 'purchaseUrl', title: 'Lien d’achat', type: 'url'}),
    defineField({name: 'featured', title: 'Mise en avant', type: 'boolean', initialValue: false}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
})