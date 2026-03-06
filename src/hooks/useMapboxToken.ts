import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Module-level cache for the Mapbox token
let cachedToken: string | null = null;
let tokenPromise: Promise<string | null> | null = null;

async function fetchMapboxToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('get-mapbox-token');

    if (!error && data?.token) {
      cachedToken = data.token;
      return data.token;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch Mapbox token:', error);
    return null;
  }
}

// Preload the token immediately on module load
export function preloadMapboxToken(): void {
  if (!cachedToken && !tokenPromise) {
    tokenPromise = fetchMapboxToken();
  }
}

// Start preloading immediately
preloadMapboxToken();

export function useMapboxToken() {
  const [token, setToken] = useState<string | null>(cachedToken);
  const [isLoading, setIsLoading] = useState(!cachedToken);

  useEffect(() => {
    let active = true;

    // If we already have a cached token, use it immediately
    if (cachedToken) {
      setToken(cachedToken);
      setIsLoading(false);
    } else {
      // If a fetch is in progress, wait for it; otherwise start one
      if (!tokenPromise) {
        tokenPromise = fetchMapboxToken();
      }

      tokenPromise.then((fetchedToken) => {
        if (active) {
          setToken(fetchedToken);
          setIsLoading(false);
        }
      });
    }

    return () => {
      active = false;
    };
  }, []);

  return { token, isLoading };
}
