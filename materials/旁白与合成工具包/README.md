# Narration and MP4 assembly tutorial

English | [中文](README.zh.md)

Use FFmpeg and FFprobe on a machine with a microphone. This kit contains the six-second metrics card and [narration draft](旁白分段脚本.md); it does not contain a recorded narration WAV or an accepted final video. Re-record the current UI first. Adding narration to footage of the old UI does not complete the new demonstration.

## 1. Prepare genuine recordings

Save the new screen recording as `materials/项目演示-重新录制.mp4` and genuine narration as `materials/旁白与合成工具包/旁白.wav`. Review the narration against the [current metrics](../../evaluation/2026-10-17-delivery-metrics/metrics.md): distinguish historical evidence from today's demonstration, keep denominators separate, and identify controlled examples. Review the existing draft before recording; its old timing windows need not match the new footage.

Record in 1080p where possible. Keep the recording plus the six-second card within 300 seconds. Narration should follow the actions and stop by the end of the video. The commands discard the recording's audio and use the supplied WAV; padding silence does not substitute for audible narration.

## 2. Assemble without replacing the source

Run these commands in PowerShell from this directory. FFmpeg must be available as `ffmpeg`, and FFprobe as `ffprobe`. The `-n` option refuses to overwrite existing outputs; review or choose a new output filename before another attempt. Original recordings and the existing project MP4 remain unchanged.

```powershell
$newCapture = '../项目演示-重新录制.mp4'
$narration = './旁白.wav'
$card = './card.mp4'
foreach ($inputFile in @($newCapture, $narration, $card)) {
  if (-not (Test-Path -LiteralPath $inputFile -PathType Leaf)) {
    throw "Missing required recording or card: $inputFile"
  }
}
ffmpeg -n -i $newCapture -i $card `
  -filter_complex '[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,setpts=PTS-STARTPTS[v0];[1:v]scale=1920:1080,setsar=1,fps=30,setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[v]' `
  -map '[v]' -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an './silent-review.mp4'
if ($LASTEXITCODE -ne 0) { throw 'Video assembly failed' }
ffmpeg -n -i './silent-review.mp4' -i $narration `
  -map 0:v:0 -map 1:a:0 -af apad -shortest `
  -c:v copy -c:a aac -b:a 128k -movflags +faststart '../项目演示-终版候审.mp4'
if ($LASTEXITCODE -ne 0) { throw 'Narration assembly failed' }
```

`apad` extends short narration with silence; `-shortest` then ends at the video boundary. Using `-shortest` without `apad` would stop at the end of a shorter WAV and could remove the appended card. Narration longer than the video is truncated, so check the spoken ending and shorten or re-record it if necessary.

## 3. Check the candidate before submission

```powershell
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,duration -of json '../项目演示-终版候审.mp4'
ffmpeg -hide_banner -i '../项目演示-终版候审.mp4' -af volumedetect -vn -f null - 2>&1 | Select-String 'mean_volume|max_volume'
```

Confirm duration is at most 300 seconds and size at most 500 MB. Play the complete candidate with sound, verify the current UI and evidence navigation, listen for intelligible narration, check subtitle and metric wording, and watch all six seconds of the closing card. A present audio stream or a volume reading alone does not prove acceptable narration. Complete two full rehearsals and record reviewer conclusions before selecting the submitted file.

## Status

- Metrics text and `card.mp4` are available; the card alone is not a final demonstration.
- New UI recording, genuine narration WAV, candidate assembly, full playback review, and two rehearsals remain human completion steps until actual evidence is recorded.
- Keep the old MP4 as historical material. Submit a reviewed new candidate under its own name and record its hash; do not silently replace old evidence.
