"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SitesPage() {
  const utils = trpc.useUtils();
  const sitesQuery = trpc.sites.list.useQuery();
  const addSite = trpc.sites.add.useMutation({
    onSuccess: () => {
      utils.sites.list.invalidate();
      setDialogOpen(false);
      setNewUrl("");
      setNewName("");
      toast.success("Site added!");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteSite = trpc.sites.delete.useMutation({
    onSuccess: () => {
      utils.sites.list.invalidate();
      toast.success("Site archived");
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");

  const activeSites =
    sitesQuery.data?.filter((s) => s.status !== "archived") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sites</h2>
          <p className="text-muted-foreground">
            Manage websites monitored for accessibility compliance.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              Add Site
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a new site</DialogTitle>
              <DialogDescription>
                Enter the URL and name for the website you want to monitor.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addSite.mutate({ url: newUrl, name: newName || new URL(newUrl).hostname });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="My Website"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addSite.isPending}>
                  {addSite.isPending ? "Adding..." : "Add Site"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sitesQuery.isLoading ? (
        <p className="text-muted-foreground">Loading sites...</p>
      ) : activeSites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No sites yet</p>
            <p className="text-sm text-muted-foreground">
              Add your first website to start monitoring.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {activeSites.map((site) => (
            <Card key={site.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">{site.name}</CardTitle>
                  <CardDescription>{site.url}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={site.status === "active" ? "default" : "secondary"}>
                    {site.status}
                  </Badge>
                  {site.complianceScore !== null && (
                    <Badge variant="outline">{site.complianceScore}%</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSite.mutate({ id: site.id })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
