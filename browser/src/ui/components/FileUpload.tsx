import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { CircleCheck, CloudUpload, FileText, Image as ImageIcon, RotateCcw, Sheet, Trash2, CircleAlert } from 'lucide-react';
import { cx } from '../utils';
import { Progress } from './Feedback';
import './FileUpload.css';

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  /** e.g. "image/*,.pdf" */
  accept?: string;
  multiple?: boolean;
  /** Max size per file in bytes. Oversized files are reported via onReject. */
  maxSize?: number;
  onReject?: (files: File[], reason: string) => void;
  disabled?: boolean;
  hint?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** Drag-and-drop area (the native file input is hidden; only the picker dialog is native). */
export function FileDropzone({ onFiles, accept, multiple = true, maxSize, onReject, disabled, hint = 'SVG, PNG, JPG or PDF (max. 10 MB)', compact, className }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();

  const handle = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const tooBig = maxSize ? files.filter((f) => f.size > maxSize) : [];
    if (tooBig.length) onReject?.(tooBig, `File exceeds ${formatBytes(maxSize!)}`);
    const ok = files.filter((f) => !tooBig.includes(f));
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) handle(e.dataTransfer.files);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-describedby={`${id}-hint`}
      className={cx('ui-dropzone', compact && 'ui-dropzone--compact', className)}
      data-over={over || undefined}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <span className="ui-icon-tile">
        <CloudUpload />
      </span>
      <div className="ui-dropzone__text">
        <p>
          <span className="ui-dropzone__cta">Click to upload</span> or drag and drop
        </p>
        <p id={`${id}-hint`} className="ui-dropzone__hint">
          {hint}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        tabIndex={-1}
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export interface FileItemProps {
  name: string;
  size: number;
  /** 0–100 while uploading. */
  progress?: number;
  status?: 'uploading' | 'complete' | 'error';
  error?: string;
  onRemove?: () => void;
  onRetry?: () => void;
}

function iconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext ?? '')) return <ImageIcon />;
  if (['xls', 'xlsx', 'csv'].includes(ext ?? '')) return <Sheet />;
  return <FileText />;
}

/** A row in an upload list with progress, completion and error states. */
export function FileItem({ name, size, progress = 0, status = 'uploading', error, onRemove, onRetry }: FileItemProps) {
  return (
    <div className="ui-file-item" data-status={status}>
      <span className="ui-icon-tile">{iconFor(name)}</span>
      <div className="ui-file-item__main">
        <div className="ui-file-item__row">
          <div className="ui-file-item__meta">
            <span className="ui-file-item__name">{name}</span>
            <span className="ui-file-item__size">
              {status === 'error' ? <span className="ui-file-item__err">{error ?? 'Upload failed'}</span> : formatBytes(size)}
            </span>
          </div>
          {status === 'complete' && <CircleCheck className="ui-file-item__ok" aria-label="Uploaded" />}
          {status === 'error' && onRetry && (
            <button type="button" className="ui-control__btn" aria-label="Retry" onClick={onRetry}>
              <RotateCcw />
            </button>
          )}
          {status === 'error' && !onRetry && <CircleAlert className="ui-file-item__bad" aria-hidden />}
          {onRemove && (
            <button type="button" className="ui-control__btn" aria-label={`Remove ${name}`} onClick={onRemove}>
              <Trash2 />
            </button>
          )}
        </div>
        {status === 'uploading' && <Progress value={progress} size="sm" showValue={false} />}
      </div>
    </div>
  );
}
