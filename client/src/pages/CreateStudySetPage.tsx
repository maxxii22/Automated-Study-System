import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { GenerateStudySetResponse, StudySetJob } from "@automated-study-system/shared";

import { ArrowRight, FileText, Link2, Stars, TextQuote, UploadCloud } from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  createPdfStudyJob,
  createTextStudyJob,
  fetchStudyJob,
  isStudyJobTerminal,
  saveStudySet,
  subscribeToStudyJob
} from "../lib/api";
import { CreateSourceOptionCard } from "./create/CreateSourceOptionCard";
import { CreateStudySetPreview } from "./create/CreateStudySetPreview";
import {
  buildPreviewStudySet,
  CREATE_SURFACE_CARDS,
  deriveTitleFromContent,
  formatPdfTitle,
  JOB_STAGE_LABELS,
  PREVIEW_HIGHLIGHTS,
  readStoredActiveJobId,
  starterText,
  starterTitle,
  storeActiveJobId,
  toUserFacingGenerationError
} from "./create/createStudySetPageData";

export function CreateStudySetPage() {
  const navigate = useNavigate();
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const lastTextPayloadRef = useRef<{ title: string; sourceText: string } | null>(null);
  const lastPdfTitleRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceType, setSourceType] = useState<"text" | "pdf">("text");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [result, setResult] = useState<GenerateStudySetResponse | null>(null);
  const [activeJob, setActiveJob] = useState<StudySetJob | null>(null);
  const [isSocketFallbackPolling, setIsSocketFallbackPolling] = useState(false);
  const [isRestoringJob, setIsRestoringJob] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubscribeJobRef = useRef<() => void>(() => {});

  const clearJobSubscription = useCallback(() => {
    unsubscribeJobRef.current();
    unsubscribeJobRef.current = () => {};
  }, []);

  const clearJobState = useCallback(() => {
    storeActiveJobId(null);
    setActiveJob(null);
    setIsSocketFallbackPolling(false);
    setIsRestoringJob(false);
  }, []);

  const handleTextJobCompletion = useCallback((job: StudySetJob) => {
    storeActiveJobId(null);
    setIsSocketFallbackPolling(false);
    setIsRestoringJob(false);
    setActiveJob(job);

    if (job.generatedStudySet) {
      setResult(job.generatedStudySet);
      return;
    }

    setError("The generated study preview could not be loaded.");
  }, []);

  const handleJobFailure = useCallback((message: string | null | undefined) => {
    storeActiveJobId(null);
    setIsSocketFallbackPolling(false);
    setIsRestoringJob(false);
    setError(toUserFacingGenerationError(message ?? "The study job failed."));
  }, []);

  const subscribeToActiveJob = useCallback(
    (jobId: string) => {
      clearJobSubscription();
      unsubscribeJobRef.current = subscribeToStudyJob(
        jobId,
        (event) => {
          if (event.jobId !== jobId) {
            return;
          }

          setActiveJob(event.job);

          if (event.type === "study-job:completed") {
            clearJobSubscription();

            if (event.job.sourceType === "pdf" && event.studySetId) {
              storeActiveJobId(null);
              setIsSocketFallbackPolling(false);
              navigate(`/study-sets/${event.studySetId}`);
              return;
            }

            if (event.job.sourceType === "text") {
              handleTextJobCompletion(event.job);
            }
          }

          if (event.type === "study-job:failed") {
            clearJobSubscription();
            handleJobFailure(event.errorMessage);
          }
        },
        {
          onConnect: () => setIsSocketFallbackPolling(false),
          onDisconnect: () => setIsSocketFallbackPolling(true)
        }
      );
    },
    [clearJobSubscription, handleJobFailure, handleTextJobCompletion, navigate]
  );

  useEffect(() => {
    const storedJobId = readStoredActiveJobId();
    if (!storedJobId) return;

    let ignore = false;

    const hydrate = async () => {
      try {
        setIsRestoringJob(true);
        const response = await fetchStudyJob(storedJobId);
        if (ignore) return;

        setActiveJob(response.job);

        if (response.job.status === "completed") {
          if (response.job.sourceType === "pdf" && response.job.studySetId) {
            storeActiveJobId(null);
            navigate(`/study-sets/${response.job.studySetId}`);
            return;
          }

          if (response.job.sourceType === "text") {
            handleTextJobCompletion(response.job);
          }
          return;
        }

        setIsSocketFallbackPolling(true);
        subscribeToActiveJob(storedJobId);
      } catch (requestError) {
        if (!ignore) {
          clearJobState();
          setError(requestError instanceof Error ? requestError.message : "Could not restore the active PDF job.");
        }
      } finally {
        if (!ignore) setIsRestoringJob(false);
      }
    };

    void hydrate();

    return () => {
      ignore = true;
      clearJobSubscription();
    };
  }, [clearJobState, clearJobSubscription, handleTextJobCompletion, navigate, subscribeToActiveJob]);

  useEffect(() => {
    if (!activeJob || isStudyJobTerminal(activeJob) || !isSocketFallbackPolling) return;

    const intervalId = window.setInterval(() => {
      void fetchStudyJob(activeJob.id)
        .then((response) => {
          setActiveJob(response.job);

          if (response.job.status === "completed") {
            if (response.job.sourceType === "pdf" && response.job.studySetId) {
              storeActiveJobId(null);
              navigate(`/study-sets/${response.job.studySetId}`);
              return;
            }

            if (response.job.sourceType === "text") handleTextJobCompletion(response.job);
          }

          if (response.job.status === "failed") {
            storeActiveJobId(null);
            clearJobSubscription();
            handleJobFailure(response.job.errorMessage);
          }
        })
        .catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activeJob, clearJobSubscription, handleJobFailure, handleTextJobCompletion, isSocketFallbackPolling, navigate]);

  useEffect(() => clearJobSubscription, [clearJobSubscription]);

  const resultPreview = useMemo(() => buildPreviewStudySet(result), [result]);
  const hasSourceUrl = sourceUrl.trim().length > 0;
  const hasSourceText = sourceText.trim().length > 0;
  const isGeneratingPreview = isSubmitting || Boolean(activeJob && !isStudyJobTerminal(activeJob));
  const previewJobSourceType = activeJob?.sourceType ?? sourceType;
  const currentStep = resultPreview ? 4 : isGeneratingPreview ? 3 : hasSourceText || hasSourceUrl || sourceFile ? 3 : 2;
  const progressValue = typeof activeJob?.progressPercent === "number" ? Math.max(activeJob.progressPercent, 8) : isGeneratingPreview ? 14 : 0;
  const jobStageText = activeJob?.stage ? (JOB_STAGE_LABELS[activeJob.stage] ?? activeJob.stage) : "Queued";
  const jobStatusLabel = activeJob ? `${jobStageText}${typeof activeJob.progressPercent === "number" ? ` • ${activeJob.progressPercent}%` : ""}` : null;
  const showMobilePreviewFirst = isGeneratingPreview || isRestoringJob || Boolean(resultPreview);
  const sourceTextHelpId = "create-source-text-help";
  const sourceTextCountId = "create-source-text-count";
  const generationErrorId = "create-generation-error";
  const canRetryGeneration =
    !isSubmitting &&
    ((sourceType === "text" && lastTextPayloadRef.current !== null) || (sourceType === "pdf" && sourceFile !== null && lastPdfTitleRef.current));

  function resetTextInputs() {
    setSourceUrl("");
    setSourceText("");
    setResult(null);
    setError(null);
  }

  function loadStarterExample() {
    setSourceType("text");
    setTitle(starterTitle);
    setSourceUrl("");
    setSourceText(starterText);
    setResult(null);
    setError(null);
  }

  function clearPdfSelection() {
    setSourceFile(null);
    setResult(null);
    setError(null);
  }

  function applyPdfSelection() {
    if (!sourceFile) {
      setIsPdfModalOpen(false);
      return;
    }

    const nextTitle = formatPdfTitle(sourceFile.name);
    setTitle(nextTitle);
    lastPdfTitleRef.current = nextTitle;
    setIsPdfModalOpen(false);
  }

  async function retryLastGeneration() {
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    try {
      if (sourceType === "pdf") {
        if (!sourceFile || !lastPdfTitleRef.current) throw new Error("Choose the PDF again before retrying.");
        const created = await createPdfStudyJob({ title: lastPdfTitleRef.current }, sourceFile);
        setActiveJob(created.job);
        setIsSocketFallbackPolling(false);
        storeActiveJobId(created.job.id);
        subscribeToActiveJob(created.job.id);
        return;
      }

      if (!lastTextPayloadRef.current) throw new Error("Add your text again before retrying.");
      const created = await createTextStudyJob(lastTextPayloadRef.current);
      setActiveJob(created.job);
      setIsSocketFallbackPolling(false);
      storeActiveJobId(created.job.id);
      if (created.job.status === "completed" && created.job.generatedStudySet) return handleTextJobCompletion(created.job);
      subscribeToActiveJob(created.job.id);
    } catch (retryError) {
      setError(toUserFacingGenerationError(retryError instanceof Error ? retryError.message : "Could not retry generation."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setIsSaving(true);
    setError(null);

    try {
      const derivedTitle = deriveTitleFromContent(title, sourceUrl, sourceText, sourceFile);
      const combinedSourceText = sourceType === "text" ? [sourceUrl ? `Source URL: ${sourceUrl}` : "", sourceText].filter(Boolean).join("\n\n") : "";
      const savedStudySet = await saveStudySet({ sourceText: combinedSourceText, sourceType, sourceFileName: sourceFile?.name, ...result, title: derivedTitle });
      navigate(`/study-sets/${savedStudySet.id}`);
    } catch (saveError) {
      setError(toUserFacingGenerationError(saveError instanceof Error ? saveError.message : "Could not save the study set."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const derivedTitle = deriveTitleFromContent(title, sourceUrl, sourceText, sourceFile);
      const combinedSourceText = sourceType === "text" ? [sourceUrl ? `Source URL: ${sourceUrl}` : "", sourceText].filter(Boolean).join("\n\n") : "";

      if (!derivedTitle) throw new Error("Add a title, link, text, or PDF before generating.");
      if (sourceType === "text" && !sourceText.trim() && sourceUrl.trim()) throw new Error("Link-only generation is not supported yet. Paste the transcript or page text along with the link.");
      if (sourceType === "text" && !combinedSourceText.trim()) throw new Error("Add a link or paste text before generating.");

      if (sourceType === "pdf") {
        if (!sourceFile) throw new Error("Choose a PDF file before generating.");
        lastPdfTitleRef.current = derivedTitle;
        const created = await createPdfStudyJob({ title: derivedTitle }, sourceFile);
        setTitle(derivedTitle);
        setActiveJob(created.job);
        setIsSocketFallbackPolling(false);
        setResult(null);
        storeActiveJobId(created.job.id);
        if (created.job.status === "completed" && created.job.studySetId) {
          storeActiveJobId(null);
          navigate(`/study-sets/${created.job.studySetId}`);
          return;
        }
        subscribeToActiveJob(created.job.id);
      } else {
        lastTextPayloadRef.current = { title: derivedTitle, sourceText: combinedSourceText };
        const created = await createTextStudyJob({ title: derivedTitle, sourceText: combinedSourceText });
        setTitle(derivedTitle);
        setResult(null);
        setActiveJob(created.job);
        setIsSocketFallbackPolling(false);
        storeActiveJobId(created.job.id);
        if (created.job.status === "completed" && created.job.generatedStudySet) return handleTextJobCompletion(created.job);
        subscribeToActiveJob(created.job.id);
      }
    } catch (submitError) {
      setError(toUserFacingGenerationError(submitError instanceof Error ? submitError.message : "Something went wrong."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="relative px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <Reveal className="space-y-8 hidden lg:block">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.85fr)] xl:items-end">
            <div className="space-y-6">
              <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-100" variant="outline">Build a study pack</Badge>
              <div className="space-y-4">
                <h1 className="max-w-4xl font-[family-name:var(--font-display)] text-5xl leading-[0.95] text-white sm:text-6xl">Create a study experience that feels premium before it even saves.</h1>
                <p className="max-w-3xl text-lg leading-8 text-zinc-300">Bring in the raw material, shape the title, and let Study Sphere assemble a cleaner guide, stronger recall, and a preview surface that users can trust before they save.</p>
              </div>
            </div>
            <Card className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,181,111,0.06))] shadow-[0_28px_90px_rgba(0,0,0,0.2)]">
              <CardContent className="space-y-5 p-6">
                <div className="flex items-start gap-4">
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-amber-200"><Stars className="size-5" /></span>
                  <div className="space-y-2">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Designed for confidence</p>
                    <p className="text-sm leading-7 text-zinc-300">The create flow should feel like a controlled studio: minimal friction up front, clear progress in the middle, and a convincing preview before anything reaches the library.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PREVIEW_HIGHLIGHTS.map((highlight) => (
                    <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" key={highlight} variant="outline">{highlight}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {CREATE_SURFACE_CARDS.map((card, index) => (
              <Reveal delay={0.06 + index * 0.07} key={card.title}>
                <Card className="h-full rounded-[1.6rem] border border-white/10 bg-white/[0.04] shadow-[0_18px_55px_rgba(0,0,0,0.18)]"><CardContent className="space-y-3 p-5"><p className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-zinc-500">{card.title}</p><p className="text-sm leading-7 text-zinc-400">{card.copy}</p></CardContent></Card>
              </Reveal>
            ))}
          </div>
        </Reveal>

        <Reveal className="lg:hidden">
          <Card className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(135deg,rgba(14,18,28,0.96),rgba(10,12,22,0.92))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
            <CardContent className="space-y-5 p-5">
              <div className="space-y-3">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-zinc-100" variant="outline">
                  Build a study pack
                </Badge>
                <h1 className="font-[family-name:var(--font-display)] text-[2.35rem] leading-[0.94] text-white">
                  Create faster on mobile.
                </h1>
                <p className="text-sm leading-7 text-zinc-300">
                  Choose the source, add the essentials, and preview the result without wading through extra framing.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline">
                  {sourceType === "pdf" ? "PDF flow" : "Paste flow"}
                </Badge>
                <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline">
                  Step {currentStep} of 4
                </Badge>
                {jobStatusLabel ? (
                  <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline">
                    {jobStatusLabel}
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </Reveal>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.94fr)_minmax(380px,0.86fr)]">
          {showMobilePreviewFirst ? (
            <div className="lg:hidden">
              <Reveal>
                <CreateStudySetPreview
                  isGeneratingPreview={isGeneratingPreview}
                  isRestoringJob={isRestoringJob}
                  isSaving={isSaving}
                  onSave={() => void handleSave()}
                  previewJobSourceType={previewJobSourceType}
                  progressValue={progressValue}
                  resultPreview={resultPreview}
                />
              </Reveal>
            </div>
          ) : null}

          <Reveal>
            <form aria-busy={isGeneratingPreview || isSaving} className="space-y-6" onSubmit={handleSubmit}>
              <Card className="rounded-[2rem] border border-white/10 bg-black/34 shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                <CardContent className="space-y-8 p-6 sm:p-8">
                  <div className="hidden flex-wrap gap-2 sm:flex">{[1, 2, 3, 4].map((step) => <Badge className={cn("rounded-full border px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em]", step <= currentStep ? "border-amber-200/30 bg-amber-200/12 text-amber-100" : "border-white/10 bg-white/[0.04] text-zinc-500")} key={step} variant="outline">Step {step}</Badge>)}</div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Step 1</p>
                      <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-white sm:text-4xl">Choose how the study pack begins.</h2>
                      <p className="hidden text-sm leading-7 text-zinc-400 sm:block">Start from pasted notes or from a PDF. The app keeps the rest of the experience consistent either way.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <CreateSourceOptionCard active={sourceType === "text"} description="YouTube transcripts, website text, class notes, or any long-form material you can paste directly." icon={TextQuote} label="Paste" onClick={() => setSourceType("text")} title="Paste text" />
                      <CreateSourceOptionCard active={sourceType === "pdf"} description="Lecture slides, handouts, and textbook sections that should be turned into a study pack." icon={UploadCloud} label="PDF" onClick={() => { setSourceType("pdf"); setIsPdfModalOpen(true); }} title="Upload PDF" />
                    </div>
                  </div>

                  <Separator className="bg-white/8" />

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Step 2</p>
                      <Label className="text-sm font-medium text-zinc-200" htmlFor="title">{sourceType === "pdf" ? "PDF title" : "Study set title"}</Label>
                      <p className="text-sm leading-7 text-zinc-400">Give the pack a clear title so it feels easy to reopen later from the library.</p>
                    </div>
                    <Input className="h-12 rounded-2xl border-white/10 bg-white/[0.04] px-4 text-base text-white placeholder:text-zinc-500 focus-visible:border-amber-200/50 focus-visible:ring-amber-200/20" id="title" onChange={(event) => setTitle(event.target.value)} placeholder={starterTitle} value={title} />
                  </div>

                  {sourceType === "text" ? (
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-zinc-200" htmlFor="sourceUrl">Optional source link</Label>
                        <Input className="h-12 rounded-2xl border-white/10 bg-white/[0.04] px-4 text-base text-white placeholder:text-zinc-500 focus-visible:border-amber-200/50 focus-visible:ring-amber-200/20" id="sourceUrl" onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://youtube.com/watch?v=... or website URL" value={sourceUrl} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {hasSourceUrl ? <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline"><Link2 className="mr-1 size-3.5" />Link attached</Badge> : null}
                        {hasSourceText ? <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline"><FileText className="mr-1 size-3.5" />{sourceText.length} characters ready</Badge> : null}
                        {!hasSourceUrl && !hasSourceText ? <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-500" variant="outline">No source added yet</Badge> : null}
                      </div>
                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-zinc-200" htmlFor="sourceTextInline">Pasted notes or transcript</Label>
                        <Textarea
                          aria-describedby={`${sourceTextHelpId} ${sourceTextCountId}`}
                          className="min-h-[220px] rounded-[1.7rem] border-white/10 bg-white/[0.04] px-4 py-4 text-base leading-7 text-white placeholder:text-zinc-500 focus-visible:border-amber-200/50 focus-visible:ring-amber-200/20 sm:min-h-[300px]"
                          id="sourceTextInline"
                          onChange={(event) => setSourceText(event.target.value)}
                          placeholder={starterText}
                          rows={12}
                          value={sourceText}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                          <p className="leading-7 text-zinc-400" id={sourceTextHelpId}>
                            {hasSourceText ? "Text is ready for generation." : "Paste lecture notes, a transcript, or article text to generate the pack."}
                          </p>
                          <span className="font-medium text-zinc-500" id={sourceTextCountId}>
                            {sourceText.length}/50000
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button className="h-11 rounded-full border border-white/10 bg-white/[0.05] px-5 text-zinc-100 hover:bg-white/[0.08]" onClick={loadStarterExample} type="button" variant="ghost">Use Example</Button>
                        {(hasSourceUrl || hasSourceText) ? <Button className="h-11 rounded-full border border-white/10 bg-white/[0.05] px-5 text-zinc-100 hover:bg-white/[0.08]" onClick={resetTextInputs} type="button" variant="ghost">Clear</Button> : null}
                      </div>
                      {hasSourceUrl && !hasSourceText ? (
                        <div className="rounded-[1.4rem] border border-amber-200/18 bg-amber-200/10 px-4 py-4 text-sm leading-7 text-amber-100" role="alert">
                          A link alone is only stored as a reference. Paste the actual transcript or page text before generating.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Step 2</p>
                        <h3 className="text-xl font-semibold text-white">PDF source</h3>
                        <p className="hidden text-sm leading-7 text-zinc-400 sm:block">Choose the document, confirm the title, and let the worker extract the content in the background.</p>
                      </div>
                      <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1"><p className="text-sm font-semibold text-white">{sourceFile ? formatPdfTitle(sourceFile.name) : "No PDF uploaded yet"}</p><p className="text-sm leading-7 text-zinc-400">{sourceFile ? "This document is ready for extraction and generation." : "Open the selector to choose the PDF you want to turn into a study pack."}</p></div>
                          <div className="flex flex-wrap gap-3">
                            <Button className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_36%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_42px_rgba(240,141,99,0.24)] hover:opacity-95" onClick={() => setIsPdfModalOpen(true)} type="button">{sourceFile ? "Change PDF" : "Select PDF"}</Button>
                            {sourceFile ? <Button className="h-11 rounded-full border border-white/10 bg-white/[0.05] px-5 text-zinc-100 hover:bg-white/[0.08]" onClick={clearPdfSelection} type="button" variant="ghost">Remove</Button> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <Separator className="bg-white/8" />

                  <div className="space-y-4">
                    <div className="space-y-2"><p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Step 3</p><h3 className="text-xl font-semibold text-white">Generate the pack</h3><p className="hidden text-sm leading-7 text-zinc-400 sm:block">Build the study pack and send the preview surface into the panel on the right.</p></div>
                    <Button className="h-12 w-full rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_36%,#bc7cff_100%)] text-sm font-semibold text-slate-950 shadow-[0_22px_48px_rgba(240,141,99,0.28)] hover:opacity-95" disabled={isSubmitting} type="submit">{isSubmitting ? (sourceType === "pdf" ? "Uploading..." : "Generating...") : "Generate Study Pack"}<ArrowRight className="size-4" /></Button>
                  </div>

                  <input accept="application/pdf,.pdf" className="hidden" id="sourceFile" ref={pdfInputRef} type="file" onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)} />

                  {activeJob && !isStudyJobTerminal(activeJob) ? (
                    <div aria-atomic="true" aria-live="polite" className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5" role="status">
                      <div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">{activeJob.sourceType === "pdf" ? "PDF Processing Status" : "Study Pack Status"}</p><p className="text-lg font-semibold text-white">{jobStatusLabel}</p></div><Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.66rem] uppercase tracking-[0.22em] text-zinc-400" variant="outline">{isSocketFallbackPolling ? "Polling fallback" : "Live updates"}</Badge></div>
                      <Progress className="h-2 bg-white/8 [&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,#ffb56f,#f08d63,#bc7cff)]" value={progressValue} />
                      <div className="space-y-2 text-sm leading-7 text-zinc-400"><p>{isSocketFallbackPolling ? "Connection dropped for a moment. We’re polling in the background and will resync automatically." : activeJob.cacheHit ? "Cache hit detected. Your result should be ready almost instantly." : activeJob.sourceType === "pdf" ? "Your PDF is processing in the background." : "Your study pack is being generated in the background."}</p><p>You can leave this page. The app will reconnect to the job when you come back.</p></div>
                    </div>
                  ) : null}

                  {error ? <div className="space-y-4 rounded-[1.5rem] border border-rose-300/20 bg-rose-300/10 p-5" id={generationErrorId} role="alert"><p className="text-sm leading-7 text-rose-100">{error}</p><div className="flex flex-wrap gap-3">{canRetryGeneration ? <Button className="h-10 rounded-full border border-white/10 bg-white/[0.08] px-5 text-zinc-100 hover:bg-white/[0.12]" onClick={() => void retryLastGeneration()} type="button" variant="ghost">Retry Generation</Button> : null}{activeJob ? <Button className="h-10 rounded-full border border-white/10 bg-white/[0.08] px-5 text-zinc-100 hover:bg-white/[0.12]" onClick={clearJobState} type="button" variant="ghost">Clear Status</Button> : null}</div></div> : null}
                </CardContent>
              </Card>
            </form>
          </Reveal>

          <Reveal delay={0.08} className="hidden lg:block">
            <CreateStudySetPreview isGeneratingPreview={isGeneratingPreview} isRestoringJob={isRestoringJob} isSaving={isSaving} onSave={() => void handleSave()} previewJobSourceType={previewJobSourceType} progressValue={progressValue} resultPreview={resultPreview} />
          </Reveal>
        </div>
      </div>

      <Dialog onOpenChange={setIsPdfModalOpen} open={sourceType === "pdf" && isPdfModalOpen}>
        <DialogContent className="rounded-[1.9rem] border-white/10 bg-[#0d111b]/96 text-white shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:max-w-lg">
          <DialogHeader className="space-y-3">
            <DialogTitle className="font-[family-name:var(--font-display)] text-3xl text-white">Upload your PDF</DialogTitle>
            <DialogDescription className="text-base leading-7 text-zinc-400">We’ll turn the document into a saved study pack with guides, flashcards, and exam-ready practice.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <button className="flex w-full flex-col items-center justify-center gap-3 rounded-[1.7rem] border border-dashed border-white/14 bg-white/[0.04] px-6 py-10 text-center transition hover:border-white/20 hover:bg-white/[0.06]" onClick={() => pdfInputRef.current?.click()} type="button">
              <span className="inline-flex size-14 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.06] text-amber-200"><UploadCloud className="size-6" /></span>
              <div className="space-y-2"><p className="text-lg font-semibold text-white">{sourceFile ? "Choose a different PDF" : "Click to choose your PDF"}</p><p className="text-sm leading-7 text-zinc-400">{sourceFile ? sourceFile.name : "Lecture notes, handouts, and textbook sections up to 10 MB."}</p></div>
            </button>
            {sourceFile ? <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"><p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Ready</p><p className="mt-2 text-sm font-semibold text-white">PDF title: {formatPdfTitle(sourceFile.name)}</p><p className="mt-1 text-sm leading-7 text-zinc-400">This document is uploaded and ready for generation.</p></div> : null}
          </div>
          <DialogFooter className="border-t-0 bg-transparent p-0 pt-2 sm:justify-between">
            <Button className="h-11 rounded-full border border-white/10 bg-white/[0.05] px-5 text-zinc-100 hover:bg-white/[0.08]" onClick={() => setIsPdfModalOpen(false)} type="button" variant="ghost">Cancel</Button>
            <Button className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_36%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_42px_rgba(240,141,99,0.24)] hover:opacity-95" disabled={!sourceFile} onClick={applyPdfSelection} type="button">Use This PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
