"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface BadgeEmbedProps {
  siteId: string;
  canAccess: boolean;
}

export function BadgeEmbed({ siteId, canAccess }: BadgeEmbedProps) {
  const [copied, setCopied] = useState(false);

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance Badge</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Upgrade to Agency or Pro to embed a compliance badge on your client's site.
          </p>
        </CardContent>
      </Card>
    );
  }

  const badgeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/badge/${siteId}`;
  const embedCode = `<a href="https://accessaudit.com">\n  <img src="${badgeUrl}" alt="Accessibility Score" />\n</a>`;

  function handleCopy() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compliance Badge</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live preview */}
        <div className="flex items-center gap-4">
          <img
            src={`/api/badge/${siteId}`}
            alt="Compliance Badge Preview"
            className="h-5"
          />
          <span className="text-sm text-muted-foreground">Live preview</span>
        </div>

        {/* Embed code */}
        <div className="relative">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
            {embedCode}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
