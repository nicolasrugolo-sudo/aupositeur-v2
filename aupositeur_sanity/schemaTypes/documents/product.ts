import {defineField, defineType} from 'sanity'

export const product = defineType({
  name: 'product',
  title: 'Produit',
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
    defineField({name: 'description', title: 'Description', type: 'portableText'}),
    defineField({name: 'quoteText', title: 'Citation associée', type: 'text', rows: 4}),
    defineField({
      name: 'productType',
      title: 'Type de produit',
      type: 'string',
      options: {
        list: [
          {title: 'Affiche', value: 'poster'},
          {title: 'T-shirt', value: 'tshirt'},
          {title: 'Tote bag', value: 'tote'},
          {title: 'Mug', value: 'mug'},
          {title: 'Coque', value: 'phone_case'},
          {title: 'Livre', value: 'book'},
          {title: 'Autre', value: 'other'},
        ],
      },
    }),
    defineField({name: 'price', title: 'Prix', type: 'number', validation: (rule) => rule.min(0)}),
    defineField({name: 'currency', title: 'Devise', type: 'string', initialValue: 'EUR'}),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{type: 'imageWithAlt'}],
    }),
    defineField({
      name: 'variants',
      title: 'Variantes',
      type: 'array',
      of: [{type: 'productVariant'}],
    }),
    defineField({name: 'featured', title: 'Mise en avant', type: 'boolean', initialValue: false}),
    defineField({name: 'order', title: 'Ordre', type: 'number', initialValue: 0}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
})