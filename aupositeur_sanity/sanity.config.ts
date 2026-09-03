import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

const singletonTypes = new Set([
  'homePage',
  'aboutPage',
  'navigation',
  'siteSettings',
])

const singletonActions = new Set([
  'publish',
  'discardChanges',
  'restore',
])

export default defineConfig({
  name: 'default',
  title: 'Aupositeur',

  projectId: 'kylkb3qc',
  dataset: 'production',

  plugins: [
    structureTool({structure}),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
    templates: (templates) =>
      templates.filter(
        ({schemaType}) => !singletonTypes.has(schemaType),
      ),
  },

  document: {
    actions: (actions, context) =>
      singletonTypes.has(context.schemaType)
        ? actions.filter(
            ({action}) => action && singletonActions.has(action),
          )
        : actions,
  },
})