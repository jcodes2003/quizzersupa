"use client";

import Link from "next/link";

const quizSteps = [
  {
    title: "Open the teacher dashboard",
    body: "Go to the teacher dashboard and use the main action buttons at the top to start creating your quiz.",
  },
  {
    title: "Choose or create the right section",
    body: "Open Manage Sections to see the section and its code. Students use the section code to join the correct section first.",
  },
  {
    title: "Click Create Quiz",
    body: "Select the subject, choose one or more sections, set the period, and enter the quiz name.",
  },
  {
    title: "Set quiz options",
    body: "Choose whether it is a quiz or examination, add a time limit if needed, decide if submissions are open, and configure retake settings.",
  },
  {
    title: "Save the quiz and add questions",
    body: "After creating the quiz, click Add Questions to enter questions manually or import them. Use Save All when your questions are ready.",
  },
  {
    title: "Share the quiz and class details",
    body: "Students need to join the correct section with the section code first. After joining that section, they use the quiz code to access the quizzes under that section.",
  },
];

const codeNotes = [
  {
    title: "Section code",
    body: "This code is for joining a section. Students enter it first so they become part of the correct section.",
  },
  {
    title: "Quiz code",
    body: "This code is different from the section code. Students use the quiz code to access quizzes that belong to the section they joined.",
  },
  {
    title: "When to share the section code",
    body: "Share the section code when a student is not yet part of your section. The student should join the section first before taking quizzes.",
  },
  {
    title: "Where to see section codes",
    body: "Open Manage Sections to view each section and copy its code before sharing it with students.",
  },
];

export default function TeacherGuidePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">Teacher</p>
            <h1 className="text-3xl font-semibold text-white">Teacher Guide</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              A quick guide for creating quizzes and understanding how section codes and quiz codes should be used.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/teacher/classes"
              className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600"
            >
              Manage Sections
            </Link>
            <Link
              href="/teacher"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
            >
              Back To Dashboard
            </Link>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <h2 className="mb-4 text-lg font-semibold text-cyan-300">How To Create A Quiz</h2>
          <div className="space-y-3">
            {quizSteps.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
                  Step {index + 1}
                </div>
                <h3 className="text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <h2 className="mb-4 text-lg font-semibold text-cyan-300">How Section Codes Work</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {codeNotes.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <h3 className="text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
