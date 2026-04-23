"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";

interface StepAddSiteProps {
  onNext: () => void;
}

export function StepAddSite({ onNext }: StepAddSiteProps) {
  const addSite = trpc.sites.add.useMutation();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  function autoName(urlValue: string) {
    try {
      const hostname = new URL(urlValue).hostname.replace("www.", "");
      setName(hostname);
    } catch {
      // URL not valid yet, ignore
    }
  }

  async function handleAddSite(e: React.FormEvent) {
    e.preventDefault();
    const result = await addSite.mutateAsync({
      url,
      name: name || new URL(url).hostname,
    });
    if (result) {
      toast.success("Site added!");
      onNext();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Add your first site</h2>
        <p className="text-sm text-muted-foreground">
          Enter a website URL to start monitoring for accessibility issues.
        </p>
      </div>

      <form onSubmit={handleAddSite} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="siteUrl">Website URL</Label>
          <Input
            id="siteUrl"
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (!name) autoName(e.target.value);
            }}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="siteName">Friendly name</Label>
          <Input
            id="siteName"
            placeholder="Auto-generated from URL"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={addSite.isPending}>
          {addSite.isPending ? "Adding..." : "Add Site"}
        </Button>
      </form>
    </div>
  );
}
