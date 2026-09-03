import {defineField, defineType} from 'sanity'

export const productVariant = defineType({
  name: 'productVariant',
  title: 'Variante produit',
  type: 'object',
  fields: [
    defineField({name: 'label', title: 'Libellé', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'sku', title: 'SKU', type: 'string'}),
    defineField({name: 'size', title: 'Taille', type: 'string'}),
    defineField({name: 'finish', title: 'Finition', type: 'string'}),
    defineField({name: 'color', title: 'Couleur', type: 'string'}),
    defineField({name: 'price', title: 'Prix', type: 'number', validation: (rule) => rule.min(0)}),
    defineField({name: 'active', title: 'Active', type: 'boolean', initialValue: true}),
  ],
})