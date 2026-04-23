"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useActiveOrganization } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";

interface StepBrandingProps {
  onNext: () => void;
}

export function StepBranding({ onNext }: StepBrandingProps) {
  const { data: activeOrg } = useActiveOrganization();
  const updateSettings = trpc.organization.updateSettings.useMutation();
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload-logo", { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) {
      toast.error(data.error || "Upload failed");
      return;
    }

    setLogoUrl(data.url);

    // Update org logo via Better-Auth
    if (activeOrg) {
      await authClient.organization.update({
        data: { logo: data.url },
        organizationId: activeOrg.id,
      });
    }
  }

  async function handleNext() {
    await updateSettings.mutateAsync({ brandColor });
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Customize your brand</h2>
        <p className="text-sm text-muted-foreground">
          Add your agency logo and pick a brand color.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Organization logo</Label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-16 w-16 rounded-lg object-cover border"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                {activeOrg?.name?.charAt(0) ?? "A"}
              </div>
            )}
            <div>
              <Input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                PNG, JPG up to 2MB
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brandColor">Brand color</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              id="brandColor"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border"
            />
            <Input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#6366f1"
              className="w-32"
            />
          </div>
        </div>
      </div>

      <Button onClick={handleNext} disabled={updateSettings.isPending}>
        {updateSettings.isPending ? "Saving..." : "Next"}
      </Button>
    </div>
  );
}
