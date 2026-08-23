import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject");
    const gradeLevel = searchParams.get("gradeLevel");

    const lessons = await prisma.lesson.findMany({
      where: {
        ...(subject ? { subject: { name: subject } } : {}),
        ...(gradeLevel ? { gradeLevel } : {}),
      },
      include: {
        subject: true,
        chapter: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(lessons);
  } catch (error) {
    console.error("Error fetching lessons:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
