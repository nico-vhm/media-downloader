# Media Downloader 2.0

YouTube- und Spotify-Downloader für Windows mit zwei Designs (Aurora, Terminal). Die Akzentfarbe wechselt mit dem Link: YouTube rot, Spotify grün. Oberfläche auf Deutsch und Englisch.

- Videos bis 4K (MP4) oder Audio (MP3, M4A, FLAC, Opus), Einzelvideos, Playlists und Kanäle mit Auswahl
- Spotify-Tracks, -Alben und -Playlists mit Cover und Tags; große Playlists über Strg+A, Strg+C in Spotify und Einfügen
- Pause, Fortsetzen, Abbrechen (einzeln und alle), parallele Downloads, Neustart setzt offene Downloads fort
- Download-Archiv (überspringt Bekanntes), automatische Wiederholung, Tempolimit
- Untertitel, Kapitel, Zeitausschnitt, Lautstärke angleichen, Unterordner nach Kanal/Künstler/Playlist
- Benachrichtigung am Ende, optional Herunterfahren, Browser-Cookies für altersbeschränkte Videos
- Statistik, Suche und Filter, Restzeit des ganzen Stapels

```bash
npm install
npm start        # App starten
npm test         # Unit-Tests
npm run dist     # Setup + Portable nach dist/
```

yt-dlp und ffmpeg werden beim ersten Start nach `%APPDATA%\media-downloader\bin` geladen; yt-dlp aktualisiert sich einmal täglich selbst. Die alte Version (1.0) liegt in `old/`.
