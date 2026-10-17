# MP4 旁白与合成工具包 · 2026-10-17

> 依据：宗《V2-审片实测-MP4-20261017》（全片数字静音 P0＋口径卡 P1，命令已给）＋《答辩最终口径-20261017》（金标 v1.3）。
> 用途：给 `materials/项目演示-可信公告事件提取与跨文档核验.mp4`（6,791,589 B / 275.43 s）补旁白与口径卡。
> **顺序：① 有麦克风的机器按《旁白分段脚本.md》录一条 wav → ② 跑两条命令 → ③ 成片替换 materials/ 原 MP4。**

## ① 录旁白（人工，约 5 分钟）

按《旁白分段脚本.md》六段时间窗朗读（或一次录完 4:35），保存为 `旁白.wav`（48 kHz 单声道即可）。
脚本内容与 V1 讲解稿一致，数字已按金标 v1.3 终版口径改写。

## ② 生成口径卡（6 s，一次性的可复现命令）

```bash
cd materials/旁白与合成工具包
ffmpeg -y -f lavfi -i "color=c=0xFAF8F5:s=1920x1080:d=6:r=30" \
 -vf "drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':textfile=l1.txt:fontcolor=0x1A1A1A:fontsize=62:x=(w-text_w)/2:y=360,\
drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':textfile=l2.txt:fontcolor=0x1A1A1A:fontsize=44:x=(w-text_w)/2:y=500,\
drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':textfile=l3.txt:fontcolor=0x1A1A1A:fontsize=44:x=(w-text_w)/2:y=580,\
drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':textfile=l4.txt:fontcolor=0x777777:fontsize=30:x=(w-text_w)/2:y=700" \
 -c:v libx264 -pix_fmt yuv420p card.mp4
```

（注：drawtext 的 `%` 需转义；l1-l4.txt 已用全角 ％ 规避——宗实测。）

## ③ 合成成片（旁白＋口径卡一起进，总长 ≈281.4 s ≤5 min）

```bash
cd materials/旁白与合成工具包
# 步骤 1：原片＋口径卡拼接（画面段重编码一次，crf 20 视觉无损）
ffmpeg -y -i ../项目演示-可信公告事件提取与跨文档核验.mp4 -i card.mp4 \
 -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" \
 -map "[v]" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an silent.mp4
# 步骤 2：混入旁白（音轨 AAC 128k；-shortest 防越界）
ffmpeg -y -i silent.mp4 -i 旁白.wav -map 0:v -map 1:a \
 -c:v copy -c:a aac -b:a 128k -movflags +faststart -shortest ../项目演示-终版.mp4
```

## ④ 自检（提交前）

```bash
ffprobe -v error -show_entries format=duration,size -of json ../项目演示-终版.mp4   # 时长 ≤300s、大小 ≤500MB
ffmpeg -i ../项目演示-终版.mp4 -af volumedetect -f null - 2>&1 | grep mean_volume  # 不应再是 -91 dB
```

## 状态

- [x] 口径卡文本（l1-l4.txt，金标 v1.3 双口径）
- [x] card.mp4 已生成并验过（6 s / 1080p30，命令可复现）
- [ ] 旁白 wav（**待人工录音**——宗环境与本机均无可用音频设备路径，须有麦克风的人录）
- [ ] 终版合成与替换（录完 5 分钟内完成）
