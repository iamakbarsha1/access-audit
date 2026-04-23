"use client";

import { trpc } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Check, EyeOff, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Violation {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  helpUrl: string | null;
  htmlSnippet: string | null;
  selector: string | null;
  aiExplanation: string | null;
  aiFixCode: string | null;
  status: string;
  scanPageId: string;
}

interface ViolationSheetProps {
  violation: Violation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated?: () => void;
}

const impactVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  serious: "default",
  moderate: "secondary",
  minor: "outline",
};

export function ViolationSheet({
  violation,
  open,
  onOpenChange,
  onStatusUpdated,
}: ViolationSheetProps) {
  const utils = trpc.useUtils();
  const updateStatus = trpc.violations.updateStatus.useMutation({
    onSuccess: () => {
      utils.violations.listByScan.invalidate();
      onStatusUpdated?.();
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!violation) return null;

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant={impactVariant[violation.impact] ?? "outline"}>
              {violation.impact}
            </Badge>
            <SheetTitle className="text-base">{violation.ruleId}</SheetTitle>
          </div>
          <SheetDescription>{violation.description}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Location */}
          {violation.selector && (
            <div>
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                CSS Selector
              </h4>
              <code className="block rounded bg-muted px-3 py-2 text-xs">
                {violation.selector}
              </code>
            </div>
          )}

          {/* HTML Snippet */}
          {violation.htmlSnippet && (
            <div>
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                HTML Snippet
              </h4>
              <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                {violation.htmlSnippet}
              </pre>
            </div>
          )}

          {/* Help URL */}
          {violation.helpUrl && (
            <a
              href={violation.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Learn more about this rule
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <Separator />

          {/* AI Explanation */}
          {violation.aiExplanation && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">AI Explanation</h4>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed">
                {violation.aiExplanation}
              </div>
            </div>
          )}

          {/* AI Fix Code */}
          {violation.aiFixCode && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Suggested Fix</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(violation.aiFixCode!)}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
                <code>{violation.aiFixCode}</code>
              </pre>
            </div>
          )}

          {!violation.aiExplanation && !violation.aiFixCode && (
            <p className="text-sm text-muted-foreground italic">
              AI suggestions are being generated. Check back shortly.
            </p>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant={violation.status === "fixed" ? "secondary" : "default"}
              size="sm"
              onClick={() =>
                updateStatus.mutate({
                  violationId: violation.id,
                  status: violation.status === "fixed" ? "open" : "fixed",
                })
              }
              disabled={updateStatus.isPending}
            >
              <Check className="mr-1 h-4 w-4" />
              {violation.status === "fixed" ? "Reopen" : "Mark Fixed"}
            </Button>
            <Button
              variant={violation.status === "ignored" ? "secondary" : "outline"}
              size="sm"
              onClick={() =>
                updateStatus.mutate({
                  violationId: violation.id,
                  status: violation.status === "ignored" ? "open" : "ignored",
                })
              }
              disabled={updateStatus.isPending}
            >
              <EyeOff className="mr-1 h-4 w-4" />
              {violation.status === "ignored" ? "Unignore" : "Ignore"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
