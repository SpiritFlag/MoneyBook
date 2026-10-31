// Keep dormant implementations and stored data; changing these flags requires a rebuild.
export const features: { buddyReviews: boolean; mcp: boolean } = {
  buddyReviews: false,
  mcp: false,
};

export function unavailableFeatureResponse() {
  return Response.json({ message: "찾을 수 없는 경로예요." }, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}
