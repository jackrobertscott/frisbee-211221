import {css} from '@emotion/css'
import {createElement as $, FC, useEffect, useRef} from 'react'
import {theme} from '../theme'
import {useMedia} from './Media/useMedia'
/**
 *
 */
export const Graph: FC<{
  title?: string
  yLabel?: string
  xLabel?: string
  dots?: [number, number][]
  line?: number[]
  bars?: number[]
  height?: number
}> = ({
  title,
  yLabel,
  xLabel,
  dots,
  line,
  bars,
  height: _height = theme.fib[12],
}) => {
  const media = useMedia()
  const bgRef = useRef<HTMLCanvasElement>()
  const cvsRef = useRef<HTMLCanvasElement>()
  useEffect(() => {
    if (!cvsRef.current || !bgRef.current) return
    const cvs = cvsRef.current
    const height = (cvs.height = _height)
    const width = (cvs.width = bgRef.current.clientWidth)
    const ctx = cvs.getContext('2d')!
    const axis = 55
    const yMaxDots = dots ? Math.max(...dots.map((i) => i[1])) : 0
    const yMaxLine = line ? Math.max(...line) : 0
    const yMaxBars = bars ? Math.max(...bars) : 0
    const yMax = Math.max(yMaxDots, yMaxLine, yMaxBars, 5)
    const yCount = yMax + Math.round(yMax / 5)
    const yLength = height - axis
    const yIncrement = yLength / yCount
    const ySmall = yIncrement <= 20
    const xMaxDots = dots ? Math.max(...dots.map((i) => i[0])) : 0
    const xMaxLine = line ? line.length : 0
    const xMaxBars = bars ? bars.length : 0
    const xCount = Math.max(xMaxDots, xMaxLine, xMaxBars, 5) + 1
    const xLength = width - axis
    const xIncrement = xLength / xCount
    const xSmall = xIncrement <= 20
    ctx.font = '14px IBM Plex Mono, monospace'
    {
      // y axis
      const x = axis
      ctx.beginPath()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height - axis)
      for (let i = 0; i < yCount; i++) {
        const y = height - axis - Math.round(i * yIncrement)
        const bold = ySmall && i % 2 === 0
        ctx.moveTo(x, y)
        ctx.lineTo(bold ? x - 10 : x - 5, y)
        if (!ySmall || i % 2 === 0) ctx.fillText(i.toString(), x - 10, y + 5)
      }
      ctx.stroke()
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
      for (let i = 0; i < yCount; i += 2) {
        const y = height - axis - Math.round(i * yIncrement)
        ctx.moveTo(x, y)
        ctx.lineTo(width, y)
      }
      ctx.setLineDash([5])
      ctx.stroke()
      ctx.setLineDash([])
      if (yLabel) {
        ctx.beginPath()
        ctx.save()
        ctx.translate(20, yLength / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.textAlign = 'center'
        ctx.fillText(yLabel, 0, 0)
        ctx.restore()
      }
    }
    {
      // x axis
      const y = height - axis
      ctx.beginPath()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      ctx.moveTo(axis, y)
      ctx.lineTo(width, y)
      for (let i = 0; i < xCount; i++) {
        const x = axis + Math.round(i * xIncrement)
        const bold = xSmall && i % 2 === 0
        ctx.moveTo(x, y)
        ctx.lineTo(x, bold ? y + 10 : y + 5)
        if (!xSmall || i % 2 === 0) ctx.fillText(i.toString(), x, y + 20)
      }
      ctx.stroke()
      if (xLabel) {
        ctx.beginPath()
        ctx.textAlign = 'center'
        ctx.fillText(xLabel, axis + xLength / 2, height - 10)
      }
    }
    if (dots) {
      ctx.beginPath()
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      for (let i = 0; i < dots.length; i++) {
        const x = axis + Math.round(dots[i][0] * xIncrement)
        const y = height - axis - Math.round(dots[i][1] * yIncrement)
        ctx.moveTo(x, y)
        ctx.arc(x, y, 3, 0, Math.PI * 2)
      }
      ctx.fill()
    }
    if (line) {
      ctx.beginPath()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
      for (let i = 0; i < line.length; i++) {
        const x = axis + Math.round(i * xIncrement)
        const y = height - axis - Math.round(line[i] * yIncrement)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    if (bars) {
      ctx.beginPath()
      ctx.lineWidth = Math.round(xIncrement / 2)
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
      for (let i = 0; i < bars.length; i++) {
        const x = axis + Math.round(i * xIncrement)
        const y = height - axis - Math.round(bars[i] * yIncrement)
        ctx.moveTo(x, y)
        ctx.lineTo(x, height - axis)
      }
      ctx.stroke()
    }
    if (title) {
      ctx.beginPath()
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      ctx.fillText(title, width / 2, 20)
    }
  }, [media.width])
  return $('div', {
    ref: bgRef,
    className: css({
      display: 'flex',
      background: theme.bg.string(),
      border: theme.border(),
    }),
    children: $('canvas', {
      ref: cvsRef,
      className: css({
        background: theme.bg.string(),
      }),
    }),
  })
}
