import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType,
} from 'docx'
import { StoredActivity } from '@/lib/blobStore'
import { formatDuration, msToKmh, formatPace } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

function cell(text: string, bold = false, shaded = false): TableCell {
  return new TableCell({
    shading: shaded ? { type: ShadingType.SOLID, color: 'E8F4EA' } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 22 })],
        spacing: { before: 80, after: 80 },
        indent: { left: 120, right: 120 },
      }),
    ],
  })
}

function row(label: string, value: string): TableRow {
  return new TableRow({
    children: [cell(label, true, true), cell(value)],
  })
}

export async function exportActivityToDoc(activity: StoredActivity): Promise<void> {
  const dateStr = format(new Date(activity.startTime), "EEEE d MMMM yyyy", { locale: it })
  const title = activity.title ?? activity.notes ?? 'Escursione'
  const paceStr = formatPace(activity.distanceMeters, activity.totalTimeSeconds)

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Palatino Linotype', size: 24 },
        },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1400, right: 1400 } } },
        children: [
          // Titolo
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: '🥾 Diario di Trekking',
                bold: true, size: 52, color: '2D5016',
              }),
            ],
          }),

          // Sottotitolo escursione
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({ text: title, bold: true, size: 36, color: '5A3E0A' }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({ text: dateStr, size: 26, color: '777777', italics: true }),
            ],
          }),

          // Linea separatrice
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2D5016' } },
            spacing: { after: 400 },
            children: [],
          }),

          // Sezione: Dati principali
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
            children: [new TextRun({ text: 'Dati principali', bold: true, size: 30, color: '2D5016' })],
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              row('Distanza', `${(activity.distanceMeters / 1000).toFixed(2)} km`),
              row('Durata', formatDuration(activity.totalTimeSeconds)),
              row('Passo medio', paceStr),
              row('Velocità media', `${msToKmh(activity.avgSpeedMs)} km/h`),
              row('Velocità massima', `${msToKmh(activity.maxSpeedMs)} km/h`),
              row('Calorie bruciate', `${activity.calories} kcal`),
              row('Dispositivo', activity.device),
            ],
          }),

          // Sezione: Frequenza cardiaca
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
            children: [new TextRun({ text: 'Frequenza Cardiaca', bold: true, size: 30, color: 'C0392B' })],
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              row('FC Media', `${activity.avgHeartRate} bpm`),
              row('FC Massima', `${activity.maxHeartRate} bpm`),
            ],
          }),

          // Sezione: Altimetria
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
            children: [new TextRun({ text: 'Altimetria', bold: true, size: 30, color: '1A5276' })],
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              row('Quota partenza', `${activity.trackPoints[0]?.altitudeMeters?.toFixed(1) ?? '--'} m`),
              row('Quota minima', `${activity.altitudeMin.toFixed(1)} m`),
              row('Quota massima', `${activity.altitudeMax.toFixed(1)} m`),
              row('Dislivello positivo', `${activity.elevationGain.toFixed(1)} m`),
              row('Dislivello negativo', `${activity.elevationLoss.toFixed(1)} m`),
            ],
          }),

          // Sezione: Note personali
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
            children: [new TextRun({ text: 'Note personali', bold: true, size: 30, color: '2D5016' })],
          }),

          new Paragraph({
            spacing: { before: 100, after: 200 },
            children: [
              new TextRun({
                text: activity.userNotes && activity.userNotes.trim()
                  ? activity.userNotes
                  : '(Nessuna nota inserita)',
                size: 24,
                italics: !activity.userNotes,
                color: activity.userNotes ? '222222' : '999999',
              }),
            ],
          }),

          // Sezione: Tag
          ...(activity.tags && activity.tags.length > 0
            ? [
                new Paragraph({
                  spacing: { before: 200, after: 100 },
                  children: [
                    new TextRun({ text: 'Tag: ', bold: true, size: 24 }),
                    new TextRun({ text: activity.tags.join(', '), size: 24, color: '5A3E0A' }),
                  ],
                }),
              ]
            : []),

          // Footer
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
            children: [
              new TextRun({
                text: `Generato da Diario Trekking • ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
                size: 18, color: 'AAAAAA',
              }),
            ],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `escursione_${format(new Date(activity.startTime), 'yyyyMMdd_HHmm')}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
