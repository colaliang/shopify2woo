'use client'

/**
 * This configuration is used to for the Sanity Studio that’s mounted on the `/app/studio/[[...tool]]/page.tsx` route
 */

import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {markdownSchema} from 'sanity-plugin-markdown'
import {TranslateCategoryAction} from './src/sanity/actions/TranslateCategoryAction'

// Go to https://www.sanity.io/docs/api-versioning to learn how API versioning works
import {schema} from './src/sanity/schemaTypes'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET

if (!projectId || !dataset) {
  throw new Error('Missing projectId or dataset. Check your .env file')
}

export default defineConfig({
  basePath: '/studio',
  projectId,
  dataset,
  // Add and edit the content schema in the './sanity/schema' folder
  schema,
  document: {
    actions: (prev, context) => {
      return context.schemaType === 'category'
        ? [...prev, TranslateCategoryAction]
        : prev
    },
  },
  plugins: [
    structureTool(),
    markdownSchema(),
    // Vision is a tool that lets you query your content with GROQ in the studio
    // https://www.sanity.io/docs/the-vision-plugin
    visionTool({defaultApiVersion: '2024-01-01'}),
  ],
})
