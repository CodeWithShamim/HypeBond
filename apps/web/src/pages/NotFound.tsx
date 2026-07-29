import { Link } from "react-router-dom";
import { Button, EmptyState } from "@/components/ui";

export function NotFound() {
  return (
    <div className="py-16">
      <EmptyState
        title="404 — off the drop list"
        body="This page doesn't exist. The hype is elsewhere."
        action={
          <Link to="/">
            <Button variant="ghost">Back home</Button>
          </Link>
        }
      />
    </div>
  );
}
