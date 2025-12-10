interface Area {
  width: number
  height: number
  x: number
  y: number
}

export const getCroppedImg = (imageSrc: string, pixelCrop: Area): Promise<Blob | null> => {
  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => resolve(image))
      image.addEventListener('error', (error) => reject(error))
      image.setAttribute('crossOrigin', 'anonymous')
      image.src = url
    })

  return new Promise(async (resolve, reject) => {
    try {
        const image = await createImage(imageSrc)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
            return reject(new Error('No 2d context'))
        }

        // set canvas width to final desired crop size - this will clear existing context
        canvas.width = pixelCrop.width
        canvas.height = pixelCrop.height

        // paste generated rotate image at the top left corner
        ctx.drawImage(
            image,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.width,
            pixelCrop.height,
            0,
            0,
            pixelCrop.width,
            pixelCrop.height
        )

        // As Blob
        canvas.toBlob((blob) => {
            resolve(blob)
        }, 'image/jpeg')
    } catch (e) {
        reject(e)
    }
  })
}
