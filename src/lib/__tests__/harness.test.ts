describe("jest harness", () => {
  it("runs TypeScript in src/lib", () => {
    const doubled: number = [1, 2, 3].map((n) => n * 2).reduce((a, b) => a + b, 0);
    expect(doubled).toBe(12);
  });
});
