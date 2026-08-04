import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AccessDenied({ title = "Access denied" }: { title?: string }) {
  return (
    <Card className="mx-auto max-w-lg animate-fade-up">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this page. Ask an admin if you need access.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to Home</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
