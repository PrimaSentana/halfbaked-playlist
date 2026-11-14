from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PlaylistAddition
from app.schemas import AdditionCreate, AdditionRead, AdditionUpdate
from app import spotify
from app.errors import to_http

router = APIRouter(prefix="/additions", tags=["Addition Playlist"])

@router.post("", response_model=AdditionRead, status_code=status.HTTP_201_CREATED)
def create_addition(payload: AdditionCreate, db: Session = Depends(get_db)):
    addition = PlaylistAddition(**payload.model_dump())
    db.add(addition)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This track is already in the playlist")

    try:
        spotify.add_track_to_playlist(payload.track_uri)
    except spotify.SpotifyError as e:
        db.rollback()
        raise to_http(e)

    db.commit()
    db.refresh(addition)
    return addition

@router.get("", response_model=list[AdditionRead])
def list_additions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    stmt = (
        select(PlaylistAddition)
        .order_by(PlaylistAddition.added_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return db.scalars(stmt).all()

@router.get("/{addition_id}", response_model=AdditionRead)
def get_addition(
    addition_id: int,
    db: Session = Depends(get_db),
):
    addition = db.get(PlaylistAddition, addition_id)
    if addition is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Track gak ketemu")
    return addition

@router.patch("/{addition_id}", response_model=AdditionRead)
def update_addition(
    addition_id: int,
    payload: AdditionUpdate,
    db: Session = Depends(get_db)
):
    addition = db.get(PlaylistAddition, addition_id)
    if addition is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Track gak ketemu")
    addition.username = payload.username
    db.commit()
    db.refresh(addition)
    return addition

@router.delete("/{addition_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_addition(
    addition_id: int,
    db: Session = Depends(get_db)
):
    addition = db.get(PlaylistAddition, addition_id)
    if addition is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Track gak ketemu")
    db.delete(addition)
    db.commit()