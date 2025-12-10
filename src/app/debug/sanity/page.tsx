import { client } from '@/lib/sanity'

export default async function SanityDebugPage() {
  let status = 'Checking...'
  let data = null
  let error = null

  try {
    // Fetch any document to test connection
    data = await client.fetch('*[_type != "system.group"][0...1]')
    status = 'Connected'
  } catch (e) {
    status = 'Error'
    error = e instanceof Error ? e.message : String(e)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Sanity Connection Debug</h1>
      
      <div className="space-y-4">
        <div className="p-4 border rounded">
          <h2 className="font-semibold">Status</h2>
          <div className={`mt-2 ${status === 'Connected' ? 'text-green-600' : 'text-red-600'}`}>
            {status}
          </div>
        </div>

        <div className="p-4 border rounded">
          <h2 className="font-semibold">Configuration</h2>
          <pre className="mt-2 bg-gray-100 p-2 rounded text-sm overflow-auto">
            {JSON.stringify({
              projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
              dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
              hasWriteToken: !!process.env.SANITY_API_WRITE_TOKEN
            }, null, 2)}
          </pre>
        </div>

        {error && (
          <div className="p-4 border rounded border-red-200 bg-red-50">
            <h2 className="font-semibold text-red-700">Error</h2>
            <pre className="mt-2 text-sm text-red-600 overflow-auto">{error}</pre>
          </div>
        )}

        {data && (
          <div className="p-4 border rounded">
            <h2 className="font-semibold">Sample Data</h2>
            <pre className="mt-2 bg-gray-100 p-2 rounded text-sm overflow-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
