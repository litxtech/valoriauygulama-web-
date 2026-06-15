/**
 * Valoria harita - Uygulama içi, Google Maps'e yönlendirme yok.
 * Mapbox token varsa Mapbox GL JS, yoksa Leaflet + OSM tile.
 * POI marker'ları, rota çizgisi, otel konumu.
 */

import { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Poi } from '@/lib/map/pois';
import { getPoiIcon } from '@/lib/map/pois';
import type { MapUserMarker, MapPostMarker, MapDiningMarker, MapTransferTourMarker } from '@/lib/map/types';

const DEFAULT_LAT = 40.6144;
const DEFAULT_LON = 40.31188;

export type ValoriaMapViewProps = {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  pois?: Poi[];
  routeCoordinates?: { lat: number; lng: number }[];
  hotelMarker?: { lat: number; lng: number; title: string };
  userMarkers?: MapUserMarker[];
  postMarkers?: MapPostMarker[];
  diningMarkers?: MapDiningMarker[];
  transferTourMarkers?: MapTransferTourMarker[];
  onPoiPress?: (poi: Poi) => void;
  onHotelPress?: () => void;
  onPostPress?: (postId: string) => void;
  onDiningPress?: (venueId: string) => void;
  onTransferTourPress?: (serviceId: string) => void;
  onUserPress?: (marker: MapUserMarker) => void;
  onRegionChange?: (center: { lat: number; lng: number }) => void;
  autoFitUserMarkers?: boolean;
  showUserNameLabels?: boolean;
  style?: object;
};

const mapboxToken =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
    ? String(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN).replace(/"/g, '')
    : '';

const MAPBOX_USER_MARKER_FN = `
window.__userMarkerRegistry = window.__userMarkerRegistry || {};
function __moveMapboxMarker(marker, lng, lat, animate) {
  if (!animate) {
    marker.setLngLat([lng, lat]);
    return;
  }
  var from = marker.getLngLat();
  var start = performance.now();
  var duration = 550;
  function frame(now) {
    var t = Math.min(1, (now - start) / duration);
    var ease = t * (2 - t);
    marker.setLngLat([from.lng + (lng - from.lng) * ease, from.lat + (lat - from.lat) * ease]);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
window.__setUserMarkers = function(users, showUserLabels) {
  if (!window.__valoriaMap) return;
  var nextIds = {};
  (users || []).forEach(function(u) {
    nextIds[u.id] = true;
    var existing = window.__userMarkerRegistry[u.id];
    if (existing && existing.marker) {
      var same = existing.lng === u.lng && existing.lat === u.lat;
      if (!same) {
        __moveMapboxMarker(existing.marker, u.lng, u.lat, !!u.isLiveGps);
        existing.lng = u.lng;
        existing.lat = u.lat;
      }
      return;
    }
    var border = u.isMe ? '4px solid #b8860b' : (u.userType === 'staff' ? '3px solid #6366f1' : (u.userType === 'guest' ? '3px solid #10b981' : '3px solid rgba(255,255,255,0.9)'));
    if (u.isLiveGps) border = '3px solid #22c55e';
    var wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.cursor = 'pointer';
    var el = document.createElement('div');
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.borderRadius = '20px';
    el.style.overflow = 'hidden';
    el.style.border = border;
    el.style.backgroundColor = '#e0e0e0';
    el.style.boxShadow = u.isLiveGps ? '0 0 0 2px rgba(34,197,94,0.35), 0 2px 4px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.3)';
    el.style.flexShrink = '0';
    if (u.avatarUrl) {
      var img = document.createElement('img');
      img.src = u.avatarUrl;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      el.appendChild(img);
    } else {
      el.innerHTML = '<span style="font-size:20px;color:#666;line-height:40px;text-align:center;display:block">👤</span>';
    }
    wrap.appendChild(el);
    if (showUserLabels && u.displayName && String(u.displayName).trim()) {
      var ulab = document.createElement('div');
      ulab.textContent = u.displayName;
      ulab.style.maxWidth = '88px';
      ulab.style.fontSize = '9px';
      ulab.style.fontWeight = '800';
      ulab.style.textAlign = 'center';
      ulab.style.color = '#1a1a1a';
      ulab.style.textShadow = '0 0 2px #fff,0 0 4px #fff';
      ulab.style.marginTop = '2px';
      wrap.appendChild(ulab);
    }
    var uOff = (showUserLabels && u.displayName && String(u.displayName).trim()) ? [0, -20] : [0, 0];
    var m = new mapboxgl.Marker({ element: wrap, offset: uOff }).setLngLat([u.lng, u.lat]).addTo(window.__valoriaMap);
    wrap.addEventListener('click', function() {
      if (u.isMe) return;
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'user', markerId: u.id }));
    });
    window.__userMarkerRegistry[u.id] = { marker: m, lat: u.lat, lng: u.lng };
  });
  Object.keys(window.__userMarkerRegistry).forEach(function(id) {
    if (nextIds[id]) return;
    try { window.__userMarkerRegistry[id].marker.remove(); } catch(e) {}
    delete window.__userMarkerRegistry[id];
  });
};
`;

const LEAFLET_USER_MARKER_FN = `
window.__userMarkerRegistry = window.__userMarkerRegistry || {};
window.__setUserMarkers = function(users, showUserLabels) {
  if (!window.__valoriaMap) return;
  var nextIds = {};
  (users || []).forEach(function(u) {
    nextIds[u.id] = true;
    var existing = window.__userMarkerRegistry[u.id];
    if (existing && existing.marker) {
      var same = existing.lat === u.lat && existing.lng === u.lng;
      if (!same) {
        existing.marker.setLatLng([u.lat, u.lng]);
        existing.lat = u.lat;
        existing.lng = u.lng;
      }
      return;
    }
    var html = u.avatarUrl ? '<img src="' + u.avatarUrl.replace(/"/g, '&quot;') + '" style="width:100%;height:100%;object-fit:cover" />' : '<span style="font-size:20px;color:#666;line-height:40px;text-align:center;display:block">👤</span>';
    var border = u.isMe ? '4px solid #b8860b' : (u.userType === 'staff' ? '3px solid #6366f1' : (u.userType === 'guest' ? '3px solid #10b981' : '3px solid rgba(255,255,255,0.9)'));
    if (u.isLiveGps) border = '3px solid #22c55e';
    var icon = L.divIcon({
      className: 'user-avatar-marker',
      html: '<div style="width:40px;height:40px;border-radius:20px;overflow:hidden;border:' + border + ';background:#e0e0e0;box-shadow:' + (u.isLiveGps ? '0 0 0 2px rgba(34,197,94,0.35),0 2px 4px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.3)') + '">' + html + '</div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
    var m = L.marker([u.lat, u.lng], { icon: icon }).addTo(window.__valoriaMap);
    if (u.displayName) m.bindPopup(u.displayName);
    m.on('click', function() {
      if (u.isMe) return;
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'user', markerId: u.id }));
    });
    window.__userMarkerRegistry[u.id] = { marker: m, lat: u.lat, lng: u.lng };
  });
  Object.keys(window.__userMarkerRegistry).forEach(function(id) {
    if (nextIds[id]) return;
    try { window.__valoriaMap.removeLayer(window.__userMarkerRegistry[id].marker); } catch(e) {}
    delete window.__userMarkerRegistry[id];
  });
};
`;

function buildMapboxHtml(props: ValoriaMapViewProps): string {
  const lat = props.latitude ?? DEFAULT_LAT;
  const lon = props.longitude ?? DEFAULT_LON;
  const zoom = props.zoom ?? 15;
  const pois = props.pois ?? [];
  const routeCoords = props.routeCoordinates ?? [];
  const hotel = props.hotelMarker;
  const postMarkers = props.postMarkers ?? [];
  const diningMarkers = props.diningMarkers ?? [];
  const transferTourMarkers = props.transferTourMarkers ?? [];

  const poisJson = JSON.stringify(
    pois.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      icon: getPoiIcon(p.type),
      rating: p.rating,
    }))
  );
  const postsJson = JSON.stringify(
    postMarkers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      displayName: p.displayName ?? null,
      avatarUrl: p.avatarUrl ?? null,
    }))
  );
  const diningJson = JSON.stringify(
    diningMarkers.map((d) => ({
      id: d.id,
      lat: d.lat,
      lng: d.lng,
      displayName: d.displayName ?? null,
      avatarUrl: d.avatarUrl ?? null,
    }))
  );
  const transferTourJson = JSON.stringify(
    transferTourMarkers.map((d) => ({
      id: d.id,
      lat: d.lat,
      lng: d.lng,
      displayName: d.displayName ?? null,
      avatarUrl: d.avatarUrl ?? null,
    }))
  );
  const routeJson = JSON.stringify(routeCoords.map((c) => [c.lng, c.lat]));
  const hotelJson = hotel ? JSON.stringify([hotel.lng, hotel.lat, hotel.title]) : 'null';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css" rel="stylesheet"/>
  <style>
    html,body{margin:0;padding:0;width:100%;height:100%;background:#e8eaed;}
    #map{width:100%;height:100%;min-height:200px;}
    .mapboxgl-marker.poi { cursor: pointer; }
    .mapboxgl-popup-content { padding: 8px 12px; font-size: 13px; min-width: 120px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    mapboxgl.accessToken = '${mapboxToken}';
    var center = [${lon}, ${lat}];
    var zoomLevel = ${zoom};
    var map = new mapboxgl.Map({ container: 'map', style: 'mapbox://styles/mapbox/streets-v12', center: center, zoom: zoomLevel });
    window.__valoriaMap = map;
    var markers = [];
    var routeCoords = ${routeJson};
    var hotel = ${hotelJson};
    ${MAPBOX_USER_MARKER_FN}

    map.on('load', function() {
      // Hotel marker
      if (hotel) {
        var el = document.createElement('div');
        el.className = 'hotel-marker';
        el.innerHTML = '🏨';
        el.style.fontSize = '24px';
        el.style.cursor = 'pointer';
        new mapboxgl.Marker(el).setLngLat([hotel[0], hotel[1]]).setPopup(new mapboxgl.Popup().setHTML('<b>' + hotel[2] + '</b>')).addTo(map);
        el.addEventListener('click', function() {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hotel' }));
        });
      }
      // POI markers
      var pois = ${poisJson};
      pois.forEach(function(p) {
        var el = document.createElement('div');
        el.className = 'poi';
        el.innerHTML = p.icon;
        el.style.fontSize = '22px';
        el.style.cursor = 'pointer';
        var m = new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).addTo(map);
        el.addEventListener('click', function() {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'poi', poi: p }));
        });
        markers.push(m);
      });
      // User avatar markers — RN tarafından __setUserMarkers ile güncellenir
      window.__setUserMarkers([], false);
      // Post markers (avatar + optional name under, always visible)
      var posts = ${postsJson};
      posts.forEach(function(p) {
        var wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems = 'center';
        wrap.style.cursor = 'pointer';
        var el = document.createElement('div');
        el.style.width = '36px';
        el.style.height = '36px';
        el.style.borderRadius = '18px';
        el.style.overflow = 'hidden';
        el.style.border = '3px solid #0d9488';
        el.style.backgroundColor = '#e0e0e0';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.flexShrink = '0';
        if (p.avatarUrl) {
          var img = document.createElement('img');
          img.src = p.avatarUrl;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          el.appendChild(img);
        } else {
          el.innerHTML = '<span style="font-size:16px;color:#666;line-height:36px;text-align:center;display:block">📷</span>';
        }
        wrap.appendChild(el);
        if (p.displayName && String(p.displayName).trim()) {
          var lab = document.createElement('div');
          lab.textContent = p.displayName;
          lab.style.maxWidth = '120px';
          lab.style.fontSize = '10px';
          lab.style.fontWeight = '700';
          lab.style.textAlign = 'center';
          lab.style.color = '#1a1a1a';
          lab.style.textShadow = '0 0 2px #fff,0 0 4px #fff,0 1px 0 #fff';
          lab.style.lineHeight = '1.2';
          lab.style.marginTop = '2px';
          lab.style.wordBreak = 'break-word';
          wrap.appendChild(lab);
        }
        var pOff = (p.displayName && String(p.displayName).trim()) ? [0, -17] : [0, 0];
        var m = new mapboxgl.Marker({ element: wrap, offset: pOff }).setLngLat([p.lng, p.lat]).addTo(map);
        wrap.addEventListener('click', function() {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'post', postId: p.id }));
        });
        markers.push(m);
      });
      // Dining venue markers (avatar + name under, always visible)
      var dinings = ${diningJson};
      dinings.forEach(function(d) {
        var wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems = 'center';
        wrap.style.cursor = 'pointer';
        var el = document.createElement('div');
        el.style.width = '36px';
        el.style.height = '36px';
        el.style.borderRadius = '18px';
        el.style.overflow = 'hidden';
        el.style.border = '3px solid #b8860b';
        el.style.backgroundColor = '#f5f0e6';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.flexShrink = '0';
        if (d.avatarUrl) {
          var img = document.createElement('img');
          img.src = d.avatarUrl;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          el.appendChild(img);
        } else {
          el.innerHTML = '<span style="font-size:16px;color:#5c4a2a;line-height:36px;text-align:center;display:block">🍽</span>';
        }
        wrap.appendChild(el);
        if (d.displayName && String(d.displayName).trim()) {
          var dlab = document.createElement('div');
          dlab.textContent = d.displayName;
          dlab.style.maxWidth = '120px';
          dlab.style.fontSize = '10px';
          dlab.style.fontWeight = '700';
          dlab.style.textAlign = 'center';
          dlab.style.color = '#1a1a1a';
          dlab.style.textShadow = '0 0 2px #fff,0 0 4px #fff,0 1px 0 #fff';
          dlab.style.lineHeight = '1.2';
          dlab.style.marginTop = '2px';
          dlab.style.wordBreak = 'break-word';
          wrap.appendChild(dlab);
        }
        var dOff = (d.displayName && String(d.displayName).trim()) ? [0, -17] : [0, 0];
        var m = new mapboxgl.Marker({ element: wrap, offset: dOff }).setLngLat([d.lng, d.lat]).addTo(map);
        wrap.addEventListener('click', function() {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dining', venueId: d.id }));
        });
        markers.push(m);
      });
      var transferTours = ${transferTourJson};
      transferTours.forEach(function(d) {
        var el = document.createElement('div');
        el.style.width = '36px';
        el.style.height = '36px';
        el.style.borderRadius = '18px';
        el.style.overflow = 'hidden';
        el.style.border = '3px solid #1e3a5f';
        el.style.backgroundColor = '#e8eef5';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';
        if (d.avatarUrl) {
          var img = document.createElement('img');
          img.src = d.avatarUrl;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          el.appendChild(img);
        } else {
          el.innerHTML = '<span style="font-size:16px;color:#1e3a5f;line-height:36px;text-align:center;display:block">🚌</span>';
        }
        var m = new mapboxgl.Marker(el).setLngLat([d.lng, d.lat]).setPopup(d.displayName ? new mapboxgl.Popup().setHTML('<b>' + (d.displayName || '').replace(/</g, '&lt;') + '</b>') : null).addTo(map);
        el.addEventListener('click', function() {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'transferTour', serviceId: d.id }));
        });
        markers.push(m);
      });
      // Route line
      if (routeCoords.length >= 2) {
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoords } } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#b8860b', 'line-width': 4 } });
      }
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    });

    map.on('moveend', function() {
      var c = map.getCenter();
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'region', lat: c.lat, lng: c.lng }));
    });
  </script>
</body>
</html>`;
}

function buildOsmLeafletHtml(props: ValoriaMapViewProps): string {
  const lat = props.latitude ?? DEFAULT_LAT;
  const lon = props.longitude ?? DEFAULT_LON;
  const zoom = props.zoom ?? 15;
  const pois = props.pois ?? [];
  const routeCoords = props.routeCoordinates ?? [];
  const hotel = props.hotelMarker;
  const postMarkers = props.postMarkers ?? [];
  const diningMarkers = props.diningMarkers ?? [];
  const transferTourMarkers = props.transferTourMarkers ?? [];

  const poisJson = JSON.stringify(
    pois.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      icon: getPoiIcon(p.type),
    }))
  );
  const postsJson = JSON.stringify(
    postMarkers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      displayName: p.displayName ?? null,
      avatarUrl: p.avatarUrl ?? null,
    }))
  );
  const diningOsmJson = JSON.stringify(
    diningMarkers.map((d) => ({
      id: d.id,
      lat: d.lat,
      lng: d.lng,
      displayName: d.displayName ?? null,
      avatarUrl: d.avatarUrl ?? null,
    }))
  );
  const transferTourOsmJson = JSON.stringify(
    transferTourMarkers.map((d) => ({
      id: d.id,
      lat: d.lat,
      lng: d.lng,
      displayName: d.displayName ?? null,
      avatarUrl: d.avatarUrl ?? null,
    }))
  );
  const routeJson = JSON.stringify(routeCoords.map((c) => [c.lat, c.lng]));
  const hotelJson = hotel ? JSON.stringify({ lat: hotel.lat, lng: hotel.lng, title: hotel.title }) : 'null';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>html,body{margin:0;padding:0;width:100%;height:100%;}#map{width:100%;height:100%;min-height:200px;}.leaflet-div-icon.user-avatar-marker{background:none;border:none;}</style>
</head>
<body>
  <div id="map"></div>
  <script>
    function __esc(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
    var map = L.map('map').setView([${lat}, ${lon}], ${zoom});
    window.__valoriaMap = map;
    ${LEAFLET_USER_MARKER_FN}
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
    var pois = ${poisJson};
    var route = ${routeJson};
    var hotel = ${hotelJson};
    if (hotel) {
      var h = L.marker([hotel.lat, hotel.lng]).addTo(map).bindPopup(hotel.title);
      h.on('click', function() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hotel' }));
      });
    }
    pois.forEach(function(p) {
      var m = L.marker([p.lat, p.lng]).addTo(map).bindPopup(p.name);
      m.on('click', function() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'poi', poi: p }));
      });
    });
    window.__setUserMarkers([], false);
    var posts = ${postsJson};
    posts.forEach(function(p) {
      var hasName = p.displayName && String(p.displayName).trim();
      var inner = p.avatarUrl ? '<img src="' + p.avatarUrl.replace(/"/g, '&quot;') + '" style="width:100%;height:100%;object-fit:cover" />' : '<span style="font-size:16px;color:#666;line-height:36px;text-align:center;display:block">📷</span>';
      var namePart = hasName
        ? ('<div style="max-width:120px;font-size:10px;font-weight:700;text-align:center;margin-top:2px;line-height:1.2;color:#1a1a1a;word-break:break-word;text-shadow:0 0 2px #fff,0 0 4px #fff">' + __esc(p.displayName) + '</div>')
        : '';
      var block = '<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer"><div style="width:36px;height:36px;border-radius:18px;overflow:hidden;border:3px solid #0d9488;background:#e0e0e0;box-shadow:0 2px 4px rgba(0,0,0,0.3);flex-shrink:0">' + inner + '</div>' + namePart + '</div>';
      var w = 120, h = hasName ? 72 : 36;
      var icon = L.divIcon({ className: 'user-avatar-marker', html: block, iconSize: [w, h], iconAnchor: [w / 2, 18] });
      var m = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
      m.on('click', function() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'post', postId: p.id }));
      });
    });
    var dinings = ${diningOsmJson};
    dinings.forEach(function(d) {
      var hasName = d.displayName && String(d.displayName).trim();
      var inner = d.avatarUrl ? '<img src="' + d.avatarUrl.replace(/"/g, '&quot;') + '" style="width:100%;height:100%;object-fit:cover" />' : '<span style="font-size:16px;color:#5c4a2a;line-height:36px;text-align:center;display:block">🍽</span>';
      var namePart = hasName
        ? ('<div style="max-width:120px;font-size:10px;font-weight:700;text-align:center;margin-top:2px;line-height:1.2;color:#1a1a1a;word-break:break-word;text-shadow:0 0 2px #fff,0 0 4px #fff">' + __esc(d.displayName) + '</div>')
        : '';
      var block = '<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer"><div style="width:36px;height:36px;border-radius:18px;overflow:hidden;border:3px solid #b8860b;background:#f5f0e6;box-shadow:0 2px 4px rgba(0,0,0,0.3);flex-shrink:0">' + inner + '</div>' + namePart + '</div>';
      var w = 120, h = hasName ? 72 : 36;
      var icon = L.divIcon({ className: 'user-avatar-marker', html: block, iconSize: [w, h], iconAnchor: [w / 2, 18] });
      var m = L.marker([d.lat, d.lng], { icon: icon }).addTo(map);
      m.on('click', function() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dining', venueId: d.id }));
      });
    });
    var transferToursOsm = ${transferTourOsmJson};
    transferToursOsm.forEach(function(d) {
      var html = d.avatarUrl ? '<img src="' + d.avatarUrl.replace(/"/g, '&quot;') + '" style="width:100%;height:100%;object-fit:cover" />' : '<span style="font-size:16px;color:#1e3a5f;line-height:36px;text-align:center;display:block">🚌</span>';
      var icon = L.divIcon({
        className: 'user-avatar-marker',
        html: '<div style="width:36px;height:36px;border-radius:18px;overflow:hidden;border:3px solid #1e3a5f;background:#e8eef5;box-shadow:0 2px 4px rgba(0,0,0,0.3);cursor:pointer">' + html + '</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      var m = L.marker([d.lat, d.lng], { icon: icon }).addTo(map);
      if (d.displayName) m.bindPopup(d.displayName);
      m.on('click', function() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'transferTour', serviceId: d.id }));
      });
    });
    if (route.length >= 2) {
      L.polyline(route, { color: '#b8860b', weight: 4 }).addTo(map);
    }
    map.on('moveend', function() {
      var c = map.getCenter();
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'region', lat: c.lat, lng: c.lng }));
    });
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  </script>
</body>
</html>`;
}

export default function ValoriaMapView({
  latitude = DEFAULT_LAT,
  longitude = DEFAULT_LON,
  zoom = 15,
  pois = [],
  routeCoordinates = [],
  hotelMarker,
  userMarkers = [],
  postMarkers = [],
  diningMarkers = [],
  transferTourMarkers = [],
  onPoiPress,
  onHotelPress,
  onPostPress,
  onDiningPress,
  onTransferTourPress,
  onUserPress,
  onRegionChange,
  autoFitUserMarkers = false,
  showUserNameLabels = false,
  style,
}: ValoriaMapViewProps) {
  const webRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);

  const html = useMemo(() => {
    const props: ValoriaMapViewProps = {
      latitude,
      longitude,
      zoom,
      pois,
      routeCoordinates,
      hotelMarker,
      postMarkers,
      diningMarkers,
      transferTourMarkers,
      showUserNameLabels,
    };
    return mapboxToken ? buildMapboxHtml(props) : buildOsmLeafletHtml(props);
  }, [
    latitude,
    longitude,
    zoom,
    pois,
    routeCoordinates,
    hotelMarker,
    postMarkers,
    diningMarkers,
    transferTourMarkers,
    showUserNameLabels,
  ]);

  useEffect(() => {
    setMapReady(false);
  }, [html]);

  const userMarkersPayload = useMemo(
    () =>
      JSON.stringify(
        userMarkers.map((u) => ({
          id: u.id,
          lat: u.lat,
          lng: u.lng,
          displayName: u.displayName ?? null,
          avatarUrl: u.avatarUrl ?? null,
          isMe: !!u.isMe,
          userType: u.userType ?? null,
          userId: u.userId ?? null,
          isLiveGps: !!u.isLiveGps,
          updatedAt: u.updatedAt ?? null,
        })),
      ),
    [userMarkers],
  );

  useEffect(() => {
    if (!mapReady) return;
    webRef.current?.injectJavaScript(`
      try {
        if (window.__setUserMarkers) window.__setUserMarkers(${userMarkersPayload}, ${showUserNameLabels ? 'true' : 'false'});
      } catch (e) {}
      true;
    `);
  }, [mapReady, userMarkersPayload, showUserNameLabels]);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'ready') {
          setMapReady(true);
          return;
        }
        if (data.type === 'poi' && data.poi && onPoiPress) {
          const p = pois.find((x) => x.id === data.poi.id);
          if (p) onPoiPress(p);
        } else if (data.type === 'hotel' && onHotelPress) {
          onHotelPress();
        } else if (data.type === 'post' && data.postId && onPostPress) {
          onPostPress(data.postId);
        } else if (data.type === 'dining' && data.venueId && onDiningPress) {
          onDiningPress(String(data.venueId));
        } else if (data.type === 'transferTour' && data.serviceId && onTransferTourPress) {
          onTransferTourPress(String(data.serviceId));
        } else if (data.type === 'user' && data.markerId && onUserPress) {
          const m = userMarkers.find((x) => x.id === data.markerId);
          if (m) onUserPress(m);
        } else if (data.type === 'region' && onRegionChange) {
          onRegionChange({ lat: data.lat, lng: data.lng });
        }
      } catch (_) {}
    },
    [onPoiPress, onHotelPress, onPostPress, onDiningPress, onTransferTourPress, onUserPress, onRegionChange, pois, userMarkers]
  );

  const flatStyle = StyleSheet.flatten(style ?? {}) as Record<string, unknown>;
  const width = typeof flatStyle?.width === 'number' ? flatStyle.width : undefined;
  const height = typeof flatStyle?.height === 'number' ? flatStyle.height : undefined;
  const webViewStyle = width != null && height != null
    ? { width, height }
    : styles.map;

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={webViewStyle}
        scrollEnabled={false}
        bounces={false}
        nestedScrollEnabled={true}
        onMessage={onMessage}
        javaScriptEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 0, overflow: 'hidden' },
  map: { flex: 1, width: '100%', height: '100%' },
});
