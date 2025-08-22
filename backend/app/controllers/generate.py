from fastapi import APIRouter, HTTPException
from app.utils.config import settings
from google import genai
from google.genai import types
from PIL import Image, UnidentifiedImageError
from io import BytesIO
from fastapi.responses import StreamingResponse
import cloudinary
from cloudinary.uploader import upload
import wave
import io

router = APIRouter(prefix="/api/v1/generate", tags=["generate"])

# Initialize clients
api_key = settings.GOOGLE_API_KEY
client = genai.Client(api_key=api_key)

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

def text_split(text: str) -> list[str]:
    return [sentence.strip() for sentence in text.split('.') if sentence.strip()]

async def generate_story_text(prompt: str) -> str:
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"Write a story about {prompt} in about 100 words"
        )
        return response.text
    except Exception as e:
        print(f"Error generating story: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate story")

def create_wav_file(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, sample_width: int = 2) -> io.BytesIO:
    """Wraps raw PCM audio in a proper WAV header."""
    try:
        wav_io = BytesIO()
        with wave.open(wav_io, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_data)
        wav_io.seek(0)
        return wav_io
    except Exception as e:
        print(f"Error creating WAV file: {e}")
        raise HTTPException(status_code=500, detail="Failed to create WAV file")

@router.get("/story") 
async def generate_story(prompt: str) -> str:
    return await generate_story_text(prompt)

@router.get("/images")
async def generate_images(story: str):
    parts = text_split(story)
    result = []

    for idx, part in enumerate(parts):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash-preview-image-generation",
                contents=part,
                config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE'])
            )
        except Exception as e:
            print(f"Error generating image for part '{part}': {e}")
            continue

        for candidate in getattr(response, 'candidates', []):
            for content_part in getattr(candidate.content, 'parts', []):
                if getattr(content_part, 'inline_data', None) is not None:
                    try:
                        # Convert bytes to PIL image
                        image = Image.open(BytesIO(content_part.inline_data.data))

                        # Save image to buffer for Cloudinary
                        buffer = BytesIO()
                        image.save(buffer, format="PNG")
                        buffer.seek(0)

                        # Upload to Cloudinary
                        url = upload(buffer, folder="story_images")["secure_url"]

                        result.append({
                            "image_url": url,
                            "caption": part
                        })
                    except UnidentifiedImageError:
                        print(f"Could not identify image for part '{part}'")
                    except Exception as e:
                        print(f"Error processing or uploading image: {e}")

    if not result:
        raise HTTPException(status_code=500, detail="No images could be generated")
    
    return result

@router.get("/audio") 
async def generate_audio(text: str):
    try:
        audio_response = client.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Kore"
                        )
                    )
                )
            )
        )
    except Exception as e:
        print(f"Error generating audio: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate audio")

    try:
        audio_bytes = audio_response.candidates[0].content.parts[0].inline_data.data
        wav_io = create_wav_file(audio_bytes)
        return StreamingResponse(
            wav_io,
            media_type="audio/wav",
            headers={"Content-Disposition": 'attachment; filename="generated_story.wav"'}
        )
    except Exception as e:
        print(f"Error processing audio: {e}")
        raise HTTPException(status_code=500, detail="Failed to process audio")
