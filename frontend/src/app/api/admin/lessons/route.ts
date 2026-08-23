import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const lessonSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  summary: z.string().optional(),
  subjectName: z.string().min(1),
  chapterTitle: z.string().min(1),
  gradeLevel: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const body = await req.json();
    const data = lessonSchema.parse(body);

    // Find or create subject
    let subject = await prisma.subject.findUnique({
      where: { name: data.subjectName },
    });
    if (!subject) {
      subject = await prisma.subject.create({
        data: { name: data.subjectName },
      });
    }

    // Find or create chapter
    let chapter = await prisma.chapter.findFirst({
      where: {
        title: data.chapterTitle,
        subjectId: subject.id,
        gradeLevel: data.gradeLevel,
      },
    });
    if (!chapter) {
      const maxOrder = await prisma.chapter.aggregate({
        where: { subjectId: subject.id, gradeLevel: data.gradeLevel },
        _max: { orderNum: true },
      });
      chapter = await prisma.chapter.create({
        data: {
          title: data.chapterTitle,
          orderNum: (maxOrder._max.orderNum ?? 0) + 1,
          subjectId: subject.id,
          gradeLevel: data.gradeLevel,
        },
      });
    }

    const lesson = await prisma.lesson.create({
      data: {
        title: data.title,
        content: data.content,
        summary: data.summary,
        subjectId: subject.id,
        chapterId: chapter.id,
        gradeLevel: data.gradeLevel,
      },
      include: { subject: true, chapter: true },
    });

    return NextResponse.json(lesson, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    console.error("Error creating lesson:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
