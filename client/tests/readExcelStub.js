// Stand-in for read-excel-file in tests. Jest can't load the real one's
// dependency (fflate ships untranspiled ESM), and no test reads a real file.
export async function readSheet() {
  return [];
}
