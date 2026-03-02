import { useState, useEffect } from 'react';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface FeatureIdea {
  id: string;
  text: string;
  createdAt: string;
}

const STORAGE_KEY = 'admin_feature_ideas';

function loadIdeas(): FeatureIdea[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveIdeas(ideas: FeatureIdea[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
}

export default function AdminFeatureIdeas() {
  const [ideas, setIdeas] = useState<FeatureIdea[]>(loadIdeas);
  const [newIdea, setNewIdea] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    saveIdeas(ideas);
  }, [ideas]);

  const addIdea = () => {
    const text = newIdea.trim();
    if (!text) return;

    const idea: FeatureIdea = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
    };

    setIdeas((prev) => [idea, ...prev]);
    setNewIdea('');
    toast({ title: 'Idea saved', description: text });
  };

  const deleteIdea = (id: string) => {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    toast({ title: 'Idea removed' });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') addIdea();
  };

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Lightbulb className="h-7 w-7 text-yellow-500" />
        <div>
          <h1 className="text-3xl font-bold">Feature Ideas</h1>
          <p className="text-muted-foreground mt-1">
            Jot down ideas for future features and improvements.
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add New Idea</CardTitle>
          <CardDescription>Type a feature idea and press Enter or click Add.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Add bulk export for buyers..."
              value={newIdea}
              onChange={(e) => setNewIdea(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={addIdea} disabled={!newIdea.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {ideas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Lightbulb className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No ideas yet. Add your first one above!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <Card key={idea.id} className="group">
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{idea.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(idea.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={() => deleteIdea(idea.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {ideas.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4 text-center">
          {ideas.length} idea{ideas.length !== 1 ? 's' : ''} saved
        </p>
      )}
    </div>
  );
}
