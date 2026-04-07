import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import { useObjectionCategories } from '../hooks/useObjectionCategories';
import type { PlaybookSortOption } from '../types';
import { CategoryDetail } from './CategoryDetail';

export function PlaybookView() {
  const [sort, setSort] = useState<PlaybookSortOption>('most_encountered');
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const { data: categories, isLoading } = useObjectionCategories(sort);

  const filtered = (categories || []).filter(
    (cat) =>
      !search ||
      cat.name.toLowerCase().includes(search.toLowerCase()) ||
      cat.description?.toLowerCase().includes(search.toLowerCase()),
  );

  const totalInstances = (categories || []).reduce((sum, c) => sum + c.instance_count, 0);
  // const totalCalls = new Set((categories || []).map((c: any) => c.id)).size;

  if (selectedCategoryId) {
    const category = (categories || []).find((c) => c.id === selectedCategoryId);
    return (
      <CategoryDetail
        categoryId={selectedCategoryId}
        categoryName={category?.name || ''}
        onBack={() => setSelectedCategoryId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Objection Playbook</h2>
        <p className="text-muted-foreground mt-1">
          {totalInstances} objections tracked across {(categories || []).length} categories
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as PlaybookSortOption)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="most_encountered">Most Encountered</SelectItem>
            <SelectItem value="lowest_overcome">Lowest Overcome Rate</SelectItem>
            <SelectItem value="recently_updated">Recently Updated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Category Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {search ? 'No categories match your search.' : 'No objections in the library yet.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((cat) => (
            <Card
              key={cat.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedCategoryId(cat.id)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">{cat.name}</h3>
                  <CategoryIcon icon={cat.icon} />
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{cat.instance_count} instances</span>
                  <span>{cat.overcome_rate}% overcome</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Overcome rate</span>
                    <span>{cat.overcome_rate}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        cat.overcome_rate >= 60
                          ? 'bg-green-500'
                          : cat.overcome_rate >= 40
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${cat.overcome_rate}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryIcon({ icon }: { icon: string | null }) {
  // Simple mapping of icon names to emoji/symbols for visual representation
  const iconMap: Record<string, string> = {
    clock: '⏱',
    'x-circle': '✕',
    'dollar-sign': '$',
    'git-branch': '⑂',
    shield: '🛡',
    package: '📦',
    minimize: '⇕',
    mail: '✉',
    'alert-circle': '⚠',
    'help-circle': '?',
  };

  return (
    <span className="text-lg" title={icon || undefined}>
      {icon ? iconMap[icon] || '●' : '●'}
    </span>
  );
}
