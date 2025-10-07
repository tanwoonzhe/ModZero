"""Template management endpoints."""

from typing import List, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_admin

router = APIRouter()


@router.get("/", response_model=List[schemas.TemplateOut])
def list_templates(
    db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)
) -> Any:
    templates = db.query(models.Template).order_by(models.Template.created_at.desc()).all()
    return templates


@router.post("/", response_model=schemas.TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    template_in: schemas.TemplateCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    if db.query(models.Template).filter(models.Template.name == template_in.name).first():
        raise HTTPException(status_code=400, detail="Template name already exists")
    template = models.Template(
        name=template_in.name,
        subject=template_in.subject,
        body=template_in.body,
        type=template_in.type,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/{template_id}", response_model=schemas.TemplateOut)
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    template = db.query(models.Template).filter(models.Template.template_id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/{template_id}", response_model=schemas.TemplateOut)
def update_template(
    template_id: str,
    template_in: schemas.TemplateCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    template = db.query(models.Template).filter(models.Template.template_id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    # update fields
    template.name = template_in.name
    template.subject = template_in.subject
    template.body = template_in.body
    template.type = template_in.type
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> None:
    template = db.query(models.Template).filter(models.Template.template_id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
    return None