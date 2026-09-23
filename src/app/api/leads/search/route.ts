import { NextRequest, NextResponse } from "next/server";
import { DiscoveryError, discoverBusinesses } from "@/lib/leadDiscovery";

// Overpass + a handful of website audits can take a few seconds; ask the
// platform for extra time where that's honored (e.g. Vercel Pro/Enterprise).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { category, city } = await request.json();

    if (!category || !city) {
      return NextResponse.json(
        { error: "Kategori ve şehir gerekli." },
        { status: 400 }
      );
    }

    const leads = await discoverBusinesses(String(city).trim(), String(category).trim());

    return NextResponse.json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (error) {
    if (error instanceof DiscoveryError) {
      console.error("Lead discovery error:", error.message, error.cause);

      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("Lead search error:", error);

    return NextResponse.json(
      { error: "Sunucu tarafında bir hata oluştu." },
      { status: 500 }
    );
  }
}
