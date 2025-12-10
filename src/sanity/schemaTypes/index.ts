import { type SchemaTypeDefinition } from 'sanity'

import { seo } from './objects/seo'
import { openGraph } from './objects/openGraph'
import { post } from './documents/post'
import { category } from './documents/category'
import { siteSettings } from './documents/siteSettings'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    // Objects
    seo,
    openGraph,
    
    // Documents
    post,
    category,
    siteSettings,
  ],
}
