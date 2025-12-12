import { type SchemaTypeDefinition } from 'sanity'

import { seo } from './objects/seo'
import { openGraph } from './objects/openGraph'
import { localizedString } from './objects/localizedString'
import { localizedText } from './objects/localizedText'
import { localizedMarkdown } from './objects/localizedMarkdown'
import { post } from './documents/post'
import { category } from './documents/category'
import { siteSettings } from './documents/siteSettings'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    // Objects
    seo,
    openGraph,
    localizedString,
    localizedText,
    localizedMarkdown,
    
    // Documents
    post,
    category,
    siteSettings,
  ],
}
