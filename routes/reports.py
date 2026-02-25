"""
Reports Routes - Rapor endpoint'leri

Endpoints:
- GET /reports - Raporları listele
- POST /reports - Yeni rapor kaydet
- GET /reports/{report_id} - Rapor detayı
- GET /export/report - Rapor dışa aktar
"""

import io
import csv
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from .dependencies import get_db_manager, require_role

router = APIRouter(tags=["Reports"])
logger = logging.getLogger(__name__)


# --- Pydantic Model ---
class SaveReportRequest(BaseModel):
    title: str
    content: Dict[str, Any]
    created_by: Optional[str] = None


# --- Report Endpoints ---
@router.get("/reports")
def get_reports(limit: int = 50, user: dict = Depends(require_role('MANAGER', 'ENGINEER', 'OWNER'))):
    """Kayıtlı raporları listele"""
    db = get_db_manager()
    reports = db.get_saved_reports(limit)
    return {"reports": reports}


@router.post("/reports")
def save_report(request: SaveReportRequest, user: dict = Depends(require_role('MANAGER', 'ENGINEER', 'OWNER'))):
    """Yeni rapor kaydet"""
    import hashlib as _hashlib
    import json as _json

    db = get_db_manager()
    creator = request.created_by or user.get('name', 'Unknown')
    record_id = db.save_report(request.title, request.content, creator)

    if record_id == -1:
        raise HTTPException(status_code=500, detail="Rapor kaydedilemedi")

    # Rapor → ZK proof ile blockchain'e kaydet
    bc_tx_hash = None
    bc_error = None
    try:
        from routes.dependencies import get_blockchain_handler
        bc = get_blockchain_handler()
        if bc and bc.is_ready():
            report_bytes = _json.dumps(request.content, sort_keys=True).encode()
            report_hash_hex = _hashlib.sha256(report_bytes).hexdigest()
            machines = request.content.get('machines', [])
            machine_count = len(machines) if isinstance(machines, list) and machines else 1

            bc_result = bc.submit_report_record(
                report_hash_hex=report_hash_hex,
                machine_count=machine_count,
                recorded_by=user.get('address')
            )
            if bc_result.get('success'):
                bc_tx_hash = bc_result.get('tx_hash')
                logger.info(
                    "Rapor ZK proof ile blockchain'e kaydedildi",
                    extra={"event_type": "zk_proof_success",
                           "circuit_type": "REPORT_RECORD",
                           "tx_hash": bc_tx_hash},
                )
            else:
                bc_error = bc_result.get('error')
                logger.warning(
                    f"Rapor blockchain kaydı başarısız: {bc_error}",
                    extra={"event_type": "zk_proof_failed",
                           "circuit_type": "REPORT_RECORD"},
                )
    except Exception as bc_err:
        bc_error = str(bc_err)
        logger.error(
            f"Rapor blockchain kaydı exception: {bc_err}",
            extra={"event_type": "zk_proof_failed", "circuit_type": "REPORT_RECORD"},
        )

    return {
        "status": "success",
        "id": record_id,
        "blockchain": {
            "submitted": bc_tx_hash is not None,
            "tx_hash": bc_tx_hash,
            "error": bc_error,
        },
    }


@router.get("/reports/{report_id}")
def get_report(report_id: int, user: dict = Depends(require_role('MANAGER', 'ENGINEER', 'OWNER'))):
    """Rapor detayını getir"""
    db = get_db_manager()
    report = db.get_saved_report(report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Rapor bulunamadı")

    return report


# --- Export Endpoint ---
@router.get("/export/report")
def export_report(
    format: str = "json",
    machine_id: Optional[int] = None,
    days: int = 7,
    user: dict = Depends(require_role('ENGINEER', 'MANAGER', 'OWNER'))
):
    """Rapor dışa aktar (JSON, CSV)"""
    db = get_db_manager()

    try:
        machines = [machine_id] if machine_id else [1001, 2001, 3001]
        all_data = []

        for mid in machines:
            history = db.get_sensor_data(machine_id=mid, limit=500)
            for record in history:
                record['machine_id'] = mid
                all_data.append(record)

        report = {
            'generated_at': datetime.now().isoformat(),
            'generated_by': user.get('address'),
            'parameters': {
                'machine_id': machine_id,
                'days': days,
                'format': format
            },
            'summary': {
                'total_records': len(all_data),
                'machines_included': machines,
                'date_range': f"Last {days} days"
            },
            'data': all_data
        }

        if format == 'csv':
            output = io.StringIO()
            if all_data:
                writer = csv.DictWriter(output, fieldnames=all_data[0].keys())
                writer.writeheader()
                writer.writerows(all_data)

            return Response(
                content=output.getvalue(),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=pdm_report_{datetime.now().strftime('%Y%m%d')}.csv"}
            )

        return report

    except Exception as e:
        logger.error(f"Export report error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/report/pdf")
def export_report_pdf(
    machine_id: Optional[int] = None,
    days: int = 7,
    user: dict = Depends(require_role('ENGINEER', 'MANAGER', 'OWNER'))
):
    """PDF raporu oluştur ve döndür (reportlab)"""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab kütüphanesi kurulu değil. 'pip install reportlab' çalıştırın.")

    db = get_db_manager()

    try:
        machines_list = [machine_id] if machine_id else [1001, 2001, 3001]
        all_data = []
        machine_summaries = []

        for mid in machines_list:
            history = db.get_sensor_data(machine_id=mid, limit=500)
            for record in history:
                record['machine_id'] = mid
                all_data.append(record)

            if history:
                tool_wears = [float(r.get('tool_wear') or 0) for r in history]
                failures = sum(1 for r in history if r.get('prediction', 0) == 1)
                probs = [float(r.get('prediction_probability') or 0) for r in history if r.get('prediction_probability') is not None]
                avg_prob = sum(probs) / len(probs) if probs else 0
                health = round(100 - avg_prob * 100, 1)
                machine_summaries.append({
                    'machine_id': mid,
                    'type': 'L' if mid == 1001 else 'M' if mid == 2001 else 'H',
                    'records': len(history),
                    'failures': failures,
                    'avg_tool_wear': round(sum(tool_wears) / len(tool_wears), 1) if tool_wears else 0,
                    'max_tool_wear': max(tool_wears) if tool_wears else 0,
                    'health_score': health
                })

        # Build PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=22, spaceAfter=6, textColor=colors.HexColor('#1a1a2e'))
        heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=14, spaceAfter=4, textColor=colors.HexColor('#16213e'))
        normal_style = styles['Normal']
        footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=colors.grey, alignment=TA_CENTER)

        story = []

        # Cover page
        story.append(Spacer(1, 1 * cm))
        story.append(Paragraph("PDM System — Predictive Maintenance Report", title_style))
        story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#4f46e5')))
        story.append(Spacer(1, 0.5 * cm))
        story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", normal_style))
        story.append(Paragraph(f"Period: Last {days} days", normal_style))
        story.append(Paragraph(f"Machines: {', '.join(str(m) for m in machines_list)}", normal_style))
        story.append(Paragraph(f"Generated by: {user.get('address', 'Unknown')}", normal_style))
        story.append(Spacer(1, 1 * cm))

        # Summary statistics
        story.append(Paragraph("Executive Summary", heading_style))
        total_records = len(all_data)
        total_failures = sum(1 for r in all_data if r.get('prediction', 0) == 1)
        failure_rate = round(total_failures / max(total_records, 1) * 100, 1)
        avg_health = round(sum(m['health_score'] for m in machine_summaries) / max(len(machine_summaries), 1), 1)

        summary_data = [
            ['Metric', 'Value'],
            ['Total Records Analyzed', str(total_records)],
            ['Failure Predictions', str(total_failures)],
            ['Overall Failure Rate', f'{failure_rate}%'],
            ['Average Health Score', f'{avg_health}%'],
            ['Machines Monitored', str(len(machines_list))],
        ]
        summary_table = Table(summary_data, colWidths=[10 * cm, 6 * cm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4f46e5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9ff')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 1 * cm))

        # Machine health table
        story.append(Paragraph("Machine Health Overview", heading_style))
        machine_table_data = [['Machine ID', 'Type', 'Records', 'Failures', 'Avg Wear (min)', 'Max Wear (min)', 'Health Score']]
        for m in machine_summaries:
            machine_table_data.append([
                str(m['machine_id']),
                m['type'],
                str(m['records']),
                str(m['failures']),
                str(m['avg_tool_wear']),
                str(m['max_tool_wear']),
                f"{m['health_score']}%"
            ])

        machine_table = Table(machine_table_data, colWidths=[2.5 * cm, 1.5 * cm, 2 * cm, 2 * cm, 2.8 * cm, 2.8 * cm, 2.4 * cm])
        machine_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#16213e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5ff')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d0e0')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(machine_table)
        story.append(Spacer(1, 1 * cm))

        # Footer
        story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
        story.append(Spacer(1, 0.3 * cm))
        story.append(Paragraph("This report is generated by the PDM ZK-Blockchain Predictive Maintenance System. All predictions are secured via ZK proofs on zkSync Era Sepolia.", footer_style))

        doc.build(story)
        buffer.seek(0)

        filename = f"pdm_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export PDF error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
