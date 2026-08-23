import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runFullScrape } from "@/lib/scraper";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const result = await runFullScrape();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: "Erreur lors du scraping" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const totalContent = await prisma.scrapedContent.count();
    const bySource = await prisma.scrapedContent.groupBy({
      by: ["source"],
      _count: { id: true },
    });
    const lastScrape = await prisma.scrapedContent.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    return NextResponse.json({
      totalContent,
      bySource: bySource.map((s) => ({ source: s.source, count: s._count.id })),
      lastScrape: lastScrape?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("Scrape stats error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des stats" },
      { status: 500 }
    );
  }
}
