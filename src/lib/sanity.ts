import { createClient } from 'next-sanity'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const apiVersion = '2024-01-01'

if (!projectId || !dataset) {
  console.warn('Sanity project ID or dataset is missing from environment variables')
}

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: process.env.NODE_ENV === 'production',
})

export const writeClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false, // Write operations should not use CDN
  token: process.env.SANITY_API_WRITE_TOKEN,
})
