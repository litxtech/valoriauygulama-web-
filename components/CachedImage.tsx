import { Image as ExpoImage, type ImageProps } from 'expo-image';
import { memo } from 'react';
import { resolveCrossPlatformDisplayImageUrl } from '@/lib/crossPlatformImage';

type Props = ImageProps & {
  uri?: string | null;
};

export const CachedImage = memo(function CachedImage({ uri, source, ...props }: Props) {
  const displayUri = uri ? resolveCrossPlatformDisplayImageUrl(uri) : undefined;
  let finalSource = source ?? (displayUri ? { uri: displayUri } : undefined);
  if (
    finalSource &&
    typeof finalSource === 'object' &&
    'uri' in finalSource &&
    typeof finalSource.uri === 'string'
  ) {
    const resolved = resolveCrossPlatformDisplayImageUrl(finalSource.uri);
    if (resolved && resolved !== finalSource.uri) {
      finalSource = { ...finalSource, uri: resolved };
    }
  }
  if (!finalSource) return null;
  return (
    <ExpoImage
      {...props}
      source={finalSource}
      cachePolicy={props.cachePolicy ?? 'disk'}
      /** 0: disk önbelleğinden anında gösterim; gezinmede “sonradan geliyor” hissini azaltır */
      transition={props.transition ?? 0}
      priority={props.priority ?? 'high'}
    />
  );
});

