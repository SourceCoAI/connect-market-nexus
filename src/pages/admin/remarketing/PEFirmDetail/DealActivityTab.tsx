import { Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3 } from "lucide-react";

interface DealActivityTabProps {
  firmName: string;
  dealStats: {
    totalScored: number;
    approved: number;
    pending: number;
    passed: number;
    responseRate: number;
  };
  dealScores: Array<{
    id: string;
    composite_score: number;
    tier: string | null;
    status: string | null;
    created_at: string;
    buyer_id: string;
    listing: { id: string; title: string | null } | null;
  }>;
  platforms: Array<{
    id: string;
    company_name: string | null;
  }>;
}

export const DealActivityTab = ({
  firmName,
  dealStats,
  dealScores,
  platforms,
}: DealActivityTabProps) => {
  const location = useLocation();
  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{dealStats.totalScored}</p>
            <p className="text-xs text-muted-foreground">Deals Scored</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{dealStats.approved}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{dealStats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{dealStats.passed}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{dealStats.responseRate}%</p>
            <p className="text-xs text-muted-foreground">Approval Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Deal Table */}
      <Card>
        <CardHeader>
          <CardTitle>Deal History Across All Platforms</CardTitle>
          <CardDescription>
            All deals scored and sent across {firmName}'s platform companies
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dealScores.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>No deal activity yet across any platforms</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dealScores.map((score) => {
                  const platform = platforms.find(
                    (p) => p.id === score.buyer_id
                  );
                  return (
                    <TableRow key={score.id}>
                      <TableCell>
                        {score.listing?.id ? (
                          <Link
                            to={`/admin/remarketing/matching/${score.listing.id}`}
                            state={{ from: location.pathname }}
                            className="font-medium hover:underline"
                          >
                            {score.listing?.title || "Unknown"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {platform ? (
                          <Link
                            to={`/admin/buyers/${platform.id}`}
                            state={{ from: location.pathname }}
                            className="text-sm hover:underline"
                          >
                            {platform.company_name}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">{"\u2014"}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {Math.round(score.composite_score)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            score.tier === "A"
                              ? "default"
                              : score.tier === "B"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          Tier {score.tier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            score.status === "approved"
                              ? "default"
                              : score.status === "passed"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {score.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(score.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
