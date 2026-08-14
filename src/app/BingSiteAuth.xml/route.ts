export async function GET() {
  const xml = `<?xml version="1.0"?>
<users>
	<user>D0E0BE6F3CBB9C3ACCD90560EF8F5277</user>
</users>`
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
