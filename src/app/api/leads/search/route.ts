import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { category, city } = await request.json();

    if (!category || !city) {
      return NextResponse.json(
        { error: "Kategori ve şehir gerekli." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Places API anahtarı bulunamadı." },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber",
        },
        body: JSON.stringify({
          textQuery: `${category} in ${city}`,
          languageCode: "tr",
          regionCode: "TR",
          pageSize: 20,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Google Places API hatası:", data);

      return NextResponse.json(
        {
          error: "Google Places API isteği başarısız.",
          details: data,
        },
        { status: response.status }
      );
    }

    const places = (data.places || []).map((place: any) => ({
      id: place.id,
      name: place.displayName?.text || "İsimsiz işletme",
      address: place.formattedAddress || "Adres bulunamadı",
      phone: place.nationalPhoneNumber || null,
      website: place.websiteUri || null,
      mapsUrl: place.googleMapsUri || null,
      hasWebsite: Boolean(place.websiteUri),
      score: place.websiteUri ? 50 : 90,
    }));

    return NextResponse.json({
      success: true,
      count: places.length,
      leads: places,
    });
  } catch (error) {
    console.error("Lead search error:", error);

    return NextResponse.json(
      { error: "Sunucu tarafında bir hata oluştu." },
      { status: 500 }
    );
  }
}
