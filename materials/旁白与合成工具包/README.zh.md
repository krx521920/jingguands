# 旁白与 MP4 合成教程

[English](README.md) | 中文

请在有麦克风的机器上使用 FFmpeg 和 FFprobe。工具包提供六秒口径卡和[旁白草稿](旁白分段脚本.md)，没有已录好的旁白 WAV 或已验收的终版视频。请先重录当前 UI。给旧 UI 画面补旁白不能完成新版演示。

## 1. 准备真实录制的素材

将新录屏保存为 `materials/项目演示-重新录制.mp4`，真实旁白保存为 `materials/旁白与合成工具包/旁白.wav`。录音前按[当前成绩单](../../evaluation/2026-10-17-delivery-metrics/metrics.md)复核旁白：区分历史证据与本次演示，分别说明分母，明确受控案例。现有草稿必须先审核，旧时间窗不要求套用到新画面。

尽量录制 1080p 画面。新录屏加六秒卡应不超过 300 秒。旁白应跟随操作，并在视频结束前讲完。以下命令舍弃录屏自带音轨，使用提供的 WAV；填充静音不能代替可听清的旁白。

## 2. 合成并保留原始素材

在本目录用 PowerShell 执行下列命令。需能运行 `ffmpeg` 和 `ffprobe`。`-n` 会拒绝覆盖已有输出；再次尝试前先审阅产物或改用新文件名。原始录屏和已有项目 MP4 均保持原样。

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

`apad` 把短旁白补静音至足够长，随后 `-shortest` 按画面结束点收尾。若只有 `-shortest` 没有 `apad`，短 WAV 结束时就会截断视频，追加的口径卡可能丢失。旁白长于画面时会被截断，必须试听结尾并按需缩短或重录。

## 3. 上交前检查候审片

```powershell
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,duration -of json '../项目演示-终版候审.mp4'
ffmpeg -hide_banner -i '../项目演示-终版候审.mp4' -af volumedetect -vn -f null - 2>&1 | Select-String 'mean_volume|max_volume'
```

确认时长不超过 300 秒、大小不超过 500 MB。带声音完整播放候审片，核对当前 UI、证据跳转、旁白清晰度、字幕和指标口径，并看完末尾六秒卡。仅存在音轨或有音量读数不能证明旁白合格。完成两次完整演练并记录审片结论后，再选定上交文件。

## 状态

- 口径卡文本与 `card.mp4` 已有；单独的口径卡不构成终版演示。
- 新 UI 录屏、真实旁白 WAV、候审片合成、完整审片和两次演练，均须实际完成并留证后才能销项。
- 保留旧 MP4 作为历史材料。审核通过的新候审片使用独立文件名并记录哈希，不静默替换旧证据。
