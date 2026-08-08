import { whatToSay } from "../whatToSay";

it("scratch probe: non-finite lat with mutated guard", () => {
  const STATION = {
    id: "s",
    name: "Madina Fire Station",
    region: "Greater Accra Region",
    district: "La-Nkwantanang-Madina Municipal District",
    lat: 5.6837,
    lng: -0.1665,
    contacts: [],
    distanceMeters: 0,
  };
  const got = whatToSay({ lat: NaN, lng: -0.2112 }, [], STATION as any);
  console.log("RESULT:", JSON.stringify(got));
});
