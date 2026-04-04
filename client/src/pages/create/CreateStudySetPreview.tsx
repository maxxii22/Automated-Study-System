import { LoaderCircle } from "lucide-react";

import { StudyGuideRenderer } from "@/components/StudyGuideRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { OUTPUT_PREVIEW_SECTIONS, PREVIEW_HIGHLIGHTS } from "./createStudySetPageData";

type PreviewState = {
  flashcards: Array<{
    answer: string;
    order: number;
    question: string;
  }>;
  keyConcepts: string[];
  studyGuide: string;
  summary: string;
} | null;

type CreateStudySetPreviewProps = {
  isGeneratingPreview: boolean;
  isRestoringJob: boolean;
  isSaving: boolean;
  onSave: () => void;
  previewJobSourceType: "text" | "pdf";
  progressValue: number;
  resultPreview: PreviewState;
};

function PreviewSkeleton({ badgeLabel, copy, title }: { badgeLabel: string; title: string; copy: string }) {
  return (
    <div className="space-y-5 rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5">
      <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline">
        {badgeLabel}
      </Badge>
      <div className="space-y-2">
        <h3 className="font-[family-name:var(--font-display)] text-2xl text-white">{title}</h3>
        <p className="text-sm leading-7 text-zinc-400">{copy}</p>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 rounded-full bg-white/10" />
        <Skeleton className="h-5 w-11/12 rounded-full bg-white/10" />
        <Skeleton className="h-5 w-3/4 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export function CreateStudySetPreview({
  isGeneratingPreview,
  isRestoringJob,
  isSaving,
  onSave,
  previewJobSourceType,
  progressValue,
  resultPreview
}: CreateStudySetPreviewProps) {
  return (
    <div className="xl:sticky xl:top-28">
      <Card className="rounded-[1.8rem] border border-white/10 bg-black/34 shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:rounded-[2rem]">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Output surface</p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-white sm:text-4xl">
                  Review the learning experience before it hits the library.
                </h2>
              </div>
              <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline">
                Step 4
              </Badge>
            </div>
            <p className="hidden text-sm leading-7 text-zinc-400 sm:block">
              The preview panel should make the generated value obvious before a user commits it to memory.
            </p>
            <div className="hidden flex-wrap gap-2 sm:flex">
              {PREVIEW_HIGHLIGHTS.map((highlight) => (
                <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" key={highlight} variant="outline">
                  {highlight}
                </Badge>
              ))}
            </div>
          </div>

          {(isRestoringJob || isGeneratingPreview) ? (
            <div className="space-y-5">
              <div className="space-y-3 rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      {isRestoringJob ? "Reconnecting" : previewJobSourceType === "pdf" ? "Processing PDF" : "Generating Preview"}
                    </p>
                    <p className="text-xl font-semibold text-white">
                      {isRestoringJob ? "Restoring your active study job." : "Your study set is being prepared."}
                    </p>
                  </div>
                  <LoaderCircle className="size-5 animate-spin text-amber-200" />
                </div>
                <p className="text-sm leading-7 text-zinc-400">
                  {isRestoringJob
                    ? "We’re reconnecting to the last job you started so you can keep going without losing progress."
                    : previewJobSourceType === "pdf"
                      ? "You can stay here or leave this page. We’ll reconnect to the job and open the study set as soon as it’s ready."
                      : "You can stay here or leave this page. We’ll reconnect to the job and bring the generated preview back when it finishes."}
                </p>
                <Progress className="h-2 bg-white/8 [&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,#ffb56f,#f08d63,#bc7cff)]" value={progressValue} />
              </div>

              <div className="space-y-4">
                {OUTPUT_PREVIEW_SECTIONS.map((section) => (
                  <PreviewSkeleton badgeLabel={section.title} copy={section.copy} key={section.title} title={section.headline} />
                ))}
              </div>
            </div>
          ) : !resultPreview ? (
            <div className="space-y-4">
              {OUTPUT_PREVIEW_SECTIONS.map((section) => (
                <Card className="rounded-[1.7rem] border border-white/10 bg-white/[0.04]" key={section.title}>
                  <CardContent className="space-y-4 p-5">
                    <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline">
                      {section.title}
                    </Badge>
                    <div className="space-y-2">
                      <h3 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-white">{section.headline}</h3>
                      <p className="text-sm leading-7 text-zinc-400">{section.copy}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <Tabs className="gap-5" defaultValue="summary">
                <TabsList className="h-auto w-full flex-nowrap justify-start gap-2 overflow-x-auto rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-2 sm:flex-wrap" variant="line">
                  <TabsTrigger className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="summary">
                    Summary
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="guide">
                    Guide
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="concepts">
                    Concepts
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="flashcards">
                    Flashcards
                  </TabsTrigger>
                </TabsList>

                <TabsContent className="space-y-4" value="summary">
                  <Card className="rounded-[1.7rem] border border-white/10 bg-white/[0.04]">
                    <CardContent className="space-y-4 p-5">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Summary</p>
                      <p className="text-sm leading-8 text-zinc-300">{resultPreview.summary}</p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent className="space-y-4" value="guide">
                  <Card className="rounded-[1.7rem] border border-white/10 bg-white/[0.04]">
                    <CardContent className="space-y-4 p-5">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Study guide</p>
                      <StudyGuideRenderer content={resultPreview.studyGuide} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent className="space-y-4" value="concepts">
                  <Card className="rounded-[1.7rem] border border-white/10 bg-white/[0.04]">
                    <CardContent className="space-y-4 p-5">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Key concepts</p>
                      <div className="flex flex-wrap gap-2">
                        {resultPreview.keyConcepts.map((concept) => (
                          <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-zinc-300" key={concept} variant="outline">
                            {concept}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent className="space-y-4" value="flashcards">
                  <div className="space-y-4">
                    {resultPreview.flashcards.map((card) => (
                      <Card className="rounded-[1.7rem] border border-white/10 bg-white/[0.04]" key={`${card.order}-${card.question}`}>
                        <CardContent className="space-y-4 p-5">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2 rounded-[1.2rem] border border-white/8 bg-black/20 p-4">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Question</p>
                              <p className="text-sm leading-7 text-zinc-200">{card.question}</p>
                            </div>
                            <div className="space-y-2 rounded-[1.2rem] border border-white/8 bg-black/20 p-4">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Answer</p>
                              <p className="text-sm leading-7 text-zinc-300">{card.answer}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              <Button
                className="h-12 w-full rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_36%,#bc7cff_100%)] text-sm font-semibold text-slate-950 shadow-[0_22px_48px_rgba(240,141,99,0.28)] hover:opacity-95"
                disabled={isSaving}
                onClick={onSave}
                type="button"
              >
                {isSaving ? "Saving..." : "Save Study Set"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
